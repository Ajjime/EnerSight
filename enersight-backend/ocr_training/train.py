"""Fine-tune one of the three trained OCR models for the campus meters.

Starts from the model's original weights (the Colab run on Roboflow photos) and
keeps training on a mix of synthetic seven-segment displays (synth.py) and the
original real crops, so it learns the campus display style without forgetting the
meters it already read. The checkpoint kept as best_valid.pth is chosen on the real
validation split, never on the held-out test sets.

From enersight-backend/:

    python -m ocr_training.train --key crnn_ctc --out ocr_training/runs/crnn_ctc \
        --real <export>/train --valid <export>/valid --roboflow-test <labelkwh>/test

Then copy <out>/best_valid.pth to app/ocr_models/weights/<model folder>/finetuned.pth.
"""
import argparse
import json
import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image

from app.ocr_models import inference as I

from . import heldout, synth
from .data import build_crops, load_labelled_crops, score


def keep_awake():
    """Stop Windows from idle-sleeping while this process runs (it wakes back up
    paused otherwise). Lifted automatically when the process exits."""
    if sys.platform == "win32":
        import ctypes
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)


def evaluate(loaded, sets) -> dict:
    results = {}
    for name, items in sets.items():
        pairs = []
        for crop, label in items:
            try:
                pairs.append((label, I.read_crop(loaded, crop)[0]))
            except Exception:
                pairs.append((label, ""))
        results[name] = (score(pairs), pairs)
    return results


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--key", required=True, choices=[v.key for v in I.VARIANTS])
    p.add_argument("--real", action="append", default=[],
                   help="Roboflow export split folder(s) to train on (repeatable).")
    p.add_argument("--real-crops", action="append", default=[],
                   help="Folder(s) of labelled row crops from crops_from_export.py.")
    p.add_argument("--real-crops-repeat", type=int, default=3,
                   help="How many times each campus crop counts against the Roboflow ones.")
    p.add_argument("--valid", action="append", required=True,
                   help="Roboflow export split folder(s) that choose the checkpoint.")
    p.add_argument("--roboflow-test", help="The original test split, reported only.")
    p.add_argument("--init", help="Checkpoint to start from (default: the original weights).")
    p.add_argument("--steps", type=int, default=1500)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--synth", type=float, default=0.5, help="Share of synthetic samples.")
    p.add_argument("--eval-every", type=int, default=250)
    p.add_argument("--threads", type=int, default=10)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    keep_awake()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(args.threads)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if not args.real and not args.real_crops:
        p.error("give at least one --real or --real-crops folder")
    real = [(cv2.cvtColor(c, cv2.COLOR_BGR2GRAY), l) for d in args.real for c, l in build_crops(d)]
    # Photos of the actual campus meters are the scarce, valuable data, so they are
    # repeated to weigh more against the Roboflow crops.
    campus = [(cv2.cvtColor(c, cv2.COLOR_BGR2GRAY), l)
              for d in args.real_crops for c, l in load_labelled_crops(d)]
    real += campus * args.real_crops_repeat
    valid = [item for d in args.valid for item in build_crops(d)]
    sets = {"valid": valid, **heldout.all_sets(args.roboflow_test)}
    print(f"{args.key}: {len(real)} real training crops ({len(campus)} campus), "
          f"{len(valid)} validation crops", flush=True)

    init = Path(args.init) if args.init else I._VARIANT_BY_KEY[args.key].default_path
    model, converter, prediction_type = loaded = I.build_model(args.key, init)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    ctc = torch.nn.CTCLoss(blank=0, zero_infinity=True)
    cross_entropy = torch.nn.CrossEntropyLoss(ignore_index=0)

    def sample():
        if random.random() < args.synth:
            return synth.render()
        img, label = random.choice(real)
        return synth.augment(synth.jitter_crop(img)), label

    log = open(out / "log.jsonl", "a")

    def checkpoint(step, loss=None):
        model.eval()
        results = evaluate(loaded, sets)
        model.train()
        metrics = {name: {k: round(v, 2) for k, v in s.items()} for name, (s, _) in results.items()}
        for name, (s, pairs) in results.items():
            sample_text = "" if name in ("valid", "roboflow_test") else "   " + " ".join(
                f"{t}->{p or '-'}" for t, p in pairs[:: max(1, len(pairs) // 8)])
            print(f"{args.key}@{step:<5} {name:<14} exact {s['exact']:5.1f}%  value {s['value']:5.1f}%"
                  f"  char {s['char']:5.1f}%{sample_text}", flush=True)
        log.write(json.dumps({"step": step, "loss": loss, "metrics": metrics}) + "\n")
        log.flush()
        return metrics

    best = checkpoint(0)["valid"]["exact"]
    torch.save(model.state_dict(), out / "best_valid.pth")
    model.train()
    started, losses = time.time(), []

    for step in range(1, args.steps + 1):
        batch = [sample() for _ in range(args.batch)]
        images = torch.stack([I._TO_TENSOR(Image.fromarray(g)) for g, _ in batch]).to(I._DEVICE)
        text, length = converter.encode([l for _, l in batch], batch_max_length=I.BATCH_MAX_LENGTH)

        if prediction_type == "CTC":
            preds = model(images, text)
            log_probs = preds.log_softmax(2).permute(1, 0, 2)
            sizes = torch.full((images.size(0),), preds.size(1), dtype=torch.long)
            loss = ctc(log_probs, text, sizes, length)
        else:
            preds = model(images, text[:, :-1], is_train=True)
            loss = cross_entropy(preds.reshape(-1, preds.shape[-1]), text[:, 1:].reshape(-1))

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
        optimizer.step()
        losses.append(loss.item())

        if step % 25 == 0:
            rate = (time.time() - started) / step
            print(f"step {step} loss {np.mean(losses[-25:]):.4f}  {rate:.2f}s/step  "
                  f"eta {(args.steps - step) * rate / 60:.0f} min", flush=True)
        if step % args.eval_every == 0 or step == args.steps:
            metrics = checkpoint(step, float(np.mean(losses[-50:])))
            torch.save(model.state_dict(), out / f"step_{step}.pth")
            if metrics["valid"]["exact"] > best:
                best = metrics["valid"]["exact"]
                torch.save(model.state_dict(), out / "best_valid.pth")
                print(f"  new best on the validation split: {best:.1f}% exact", flush=True)

    print(f"done; best_valid.pth scored {best:.1f}% exact on the validation split", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
