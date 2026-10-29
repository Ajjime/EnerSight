"""Compare each trained model's original weights with its fine-tuned ones.

From enersight-backend/:

    python -m ocr_training.evaluate --roboflow-test <labelkwh export>/test

Scores every model that has weights installed on the held-out sets (see heldout.py),
prints a table and writes it to ocr_training/results.md.
"""
import argparse
import sys
from datetime import date
from pathlib import Path

from app.ocr_models import inference as I

from . import heldout
from .train import evaluate

SET_LABELS = {
    "campus_rows": "Campus digit rows",
    "production": "Crops the app produces",
    "roboflow_test": "Original Roboflow test split",
}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--roboflow-test", help="The original test split (not in the repo).")
    p.add_argument("--out", default=str(Path(__file__).parent / "results.md"))
    args = p.parse_args()

    sets = heldout.all_sets(args.roboflow_test)
    rows = []
    for variant in I.VARIANTS:
        original = variant.default_path
        finetuned = original.with_name(I.FINETUNED_NAME)
        for label, path in (("original", original), ("fine-tuned", finetuned)):
            if not path.is_file():
                continue
            results = evaluate(I.build_model(variant.key, path), sets)
            rows.append((variant.label, label, results))
            line = " ".join(f"{name} {s['exact']:.1f}%" for name, (s, _) in results.items())
            print(f"{variant.key:<9} {label:<10} {line}", flush=True)

    header = "| Model | Weights | " + " | ".join(SET_LABELS[n] for n in sets) + " |"
    lines = [
        "# Trained OCR models: original vs fine-tuned",
        "",
        f"Generated {date.today().isoformat()} by `python -m ocr_training.evaluate`.",
        "Each cell is exact match / right number / character accuracy, in percent.",
        "Exact match: every digit right, leading zeros included. Right number: 09732",
        "counts for 0009732, since readings are stored as numbers. Character accuracy:",
        "1 - edit distance / length, the metric the notebook and the paper report.",
        f"Campus digit rows: {len(sets['campus_rows'])} crops of 4 meters. "
        f"Crops the app produces: {len(sets['production'])}."
        + (f" Roboflow test: {len(sets['roboflow_test'])} crops." if "roboflow_test" in sets else ""),
        "",
        header,
        "|" + "---|" * (2 + len(sets)),
    ]
    for model_label, weights, results in rows:
        cells = [f"{s['exact']:.1f} / {s['value']:.1f} / {s['char']:.1f}" for _, (s, _) in results.items()]
        lines.append(f"| {model_label} | {weights} | " + " | ".join(cells) + " |")
    lines += [
        "",
        "Fine-tuned weights: `train.py` (see README.md), continued from the original",
        "weights on half synthetic seven-segment displays and half the original Roboflow",
        "crops. Each model's checkpoint was chosen on the Roboflow validation split; none",
        "of the sets above influenced that choice.",
        "",
        "The campus sets cover only four meters, and their failures guided what the",
        "synthetic renderer draws, so read those columns as optimistic. The real test is",
        "readings exported from use (`python export_ocr_dataset.py`).",
        "",
    ]
    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWritten: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
