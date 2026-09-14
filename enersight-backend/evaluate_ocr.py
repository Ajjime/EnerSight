"""Measure how accurate the meter-reading OCR actually is.

Why this exists
---------------
"How accurate is your OCR, and how did you measure it?" is the question this
project is most likely to be asked, and until now there was no answer in the
repository. The only figures anywhere were prose in a docstring (91% / 84% / 82%
character accuracy for the three trained models), and those came from a Colab
notebook that is not committed, measured on a held-out split of the same Roboflow
dataset the models were trained on. The pipeline's own comments note that the
ranking inverts on real meter photos.

This script produces a defensible number from your own photos, and it reports each
engine separately so you can show whether the ensemble actually beats its members.

Setup
-----
1. Put your meter photos in a folder, e.g. `eval_data/images/`.
2. Create `eval_data/labels.csv` with a header and one row per photo:

       filename,true_reading
       meter_001.jpg,087654
       meter_002.jpg,12345

   Read the digits off the photo yourself. Keep leading zeros. Include only the
   digits the system is meant to read, no decimal point and no units.

3. Run it:

       python evaluate_ocr.py --images eval_data/images --labels eval_data/labels.csv

Outputs
-------
- A summary table on stdout, ready to paste into your defense slides.
- `eval_results/per_image.csv`   every photo, every engine's guess, right or wrong.
- `eval_results/summary.md`      the same summary as Markdown.
- `eval_results/confusion.csv`   which digits get mistaken for which.

Metrics
-------
exact match      the whole reading is character-for-character correct. This is the
                 number that matters operationally: a reading is either usable or
                 it is not.
char accuracy    1 - (edit distance / length of the true reading), averaged over
                 photos. Partial credit, and the metric the training notebook
                 reported, so it is the one comparable to the 91/84/82 figures.
length correct   the right number of digits was found. Separates "misread a digit"
                 from "missed a digit entirely", which are different failures.
"""

import argparse
import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

# Importing the real pipeline, not a copy of it, so this measures what ships.
from app.routes.ocr import _lcd_correct, run_ocr


ENSEMBLE_KEY = "ensemble"
ENSEMBLE_LABEL = "Ensemble (shipped)"


def levenshtein(left: str, right: str) -> int:
    """Edit distance. Small strings, so the simple two-row version is plenty."""
    if left == right:
        return 0

    if not left:
        return len(right)

    if not right:
        return len(left)

    previous = list(range(len(right) + 1))

    for i, lchar in enumerate(left, start=1):
        current = [i]

        for j, rchar in enumerate(right, start=1):
            current.append(
                min(
                    previous[j] + 1,            # deletion
                    current[j - 1] + 1,         # insertion
                    previous[j - 1] + (lchar != rchar),  # substitution
                )
            )

        previous = current

    return previous[-1]


def char_accuracy(truth: str, predicted: str) -> float:
    if not truth:
        return 0.0

    distance = levenshtein(truth, predicted)

    return max(0.0, 1.0 - (distance / len(truth)))


def load_labels(labels_path: Path) -> list[tuple[str, str]]:
    rows = []

    with labels_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)

        if not reader.fieldnames:
            raise SystemExit(f"{labels_path} is empty.")

        lowered = {name.lower().strip(): name for name in reader.fieldnames}

        if "filename" not in lowered or "true_reading" not in lowered:
            raise SystemExit(
                f"{labels_path} needs a header with 'filename' and 'true_reading'. "
                f"Found: {reader.fieldnames}"
            )

        for line in reader:
            filename = (line[lowered["filename"]] or "").strip()
            truth = (line[lowered["true_reading"]] or "").strip()

            if not filename:
                continue

            if not truth.isdigit():
                print(f"  skipping {filename}: label {truth!r} is not all digits")
                continue

            rows.append((filename, truth))

    return rows


def predictions_for_image(image_path: Path) -> dict[str, dict]:
    """Run the pipeline once and pull out what every engine said.

    Returns {engine_key: {"label", "digits", "confidence"}}, including the shipped
    ensemble answer under ENSEMBLE_KEY.
    """
    result = run_ocr(str(image_path))

    raw_candidate = result.get("candidate") or ""

    # The endpoint applies this correction before showing or saving anything, so the
    # evaluation has to as well or it would be scoring a different system.
    corrected, _changed, _reason = _lcd_correct(raw_candidate)

    engines: dict[str, dict] = {
        ENSEMBLE_KEY: {
            "label": ENSEMBLE_LABEL,
            "digits": corrected,
            "confidence": float(result.get("confidence") or 0.0),
        }
    }

    for voter in result.get("ensemble_candidates") or []:
        key = voter.get("source") or "unknown"
        engines[key] = {
            "label": voter.get("label") or key,
            "digits": voter.get("digits") or "",
            "confidence": float(voter.get("instance_confidence") or 0.0),
        }

    return engines


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Score the meter OCR pipeline against hand-labelled photos."
    )
    parser.add_argument(
        "--images", default="eval_data/images", help="Folder holding the photos."
    )
    parser.add_argument(
        "--labels", default="eval_data/labels.csv", help="CSV of filename,true_reading."
    )
    parser.add_argument(
        "--out", default="eval_results", help="Where to write the result files."
    )
    parser.add_argument(
        "--limit", type=int, default=0, help="Only score the first N photos."
    )

    args = parser.parse_args()

    images_dir = Path(args.images)
    labels_path = Path(args.labels)
    out_dir = Path(args.out)

    if not labels_path.is_file():
        print(f"No labels file at {labels_path}.")
        print("Create it with a header row: filename,true_reading")
        print("See the docstring at the top of this script for the full setup.")
        return 1

    if not images_dir.is_dir():
        print(f"No image folder at {images_dir}.")
        return 1

    labels = load_labels(labels_path)

    if args.limit:
        labels = labels[: args.limit]

    if not labels:
        print("No usable labels found.")
        return 1

    print(f"Scoring {len(labels)} photo(s). The first one loads the models, so it is slow.\n")

    per_image_rows = []
    # engine -> running tallies
    tallies = defaultdict(
        lambda: {
            "n": 0,
            "exact": 0,
            "length_ok": 0,
            "char_acc_sum": 0.0,
            "conf_sum": 0.0,
            "label": "",
        }
    )
    confusion = Counter()
    missing_files = 0

    for index, (filename, truth) in enumerate(labels, start=1):
        image_path = images_dir / filename

        if not image_path.is_file():
            print(f"  [{index}/{len(labels)}] {filename}: file not found, skipped")
            missing_files += 1
            continue

        try:
            engines = predictions_for_image(image_path)
        except Exception as exc:  # noqa: BLE001 - one bad photo must not stop the run
            print(f"  [{index}/{len(labels)}] {filename}: failed ({exc})")
            continue

        ensemble_digits = engines.get(ENSEMBLE_KEY, {}).get("digits", "")
        verdict = "correct" if ensemble_digits == truth else "wrong"
        print(
            f"  [{index}/{len(labels)}] {filename}: truth={truth} "
            f"ensemble={ensemble_digits or '(none)'} -> {verdict}"
        )

        row = {"filename": filename, "true_reading": truth}

        for key, engine in engines.items():
            predicted = engine["digits"]
            is_exact = predicted == truth
            accuracy = char_accuracy(truth, predicted)

            tally = tallies[key]
            tally["label"] = engine["label"]
            tally["n"] += 1
            tally["exact"] += int(is_exact)
            tally["length_ok"] += int(len(predicted) == len(truth))
            tally["char_acc_sum"] += accuracy
            tally["conf_sum"] += engine["confidence"]

            row[f"{key}_pred"] = predicted
            row[f"{key}_exact"] = int(is_exact)
            row[f"{key}_char_acc"] = round(accuracy, 4)
            row[f"{key}_confidence"] = round(engine["confidence"], 4)

            # Position-aligned digit substitutions, only when the length matches so
            # the alignment is meaningful.
            if key == ENSEMBLE_KEY and len(predicted) == len(truth):
                for expected_digit, got_digit in zip(truth, predicted):
                    if expected_digit != got_digit:
                        confusion[(expected_digit, got_digit)] += 1

        per_image_rows.append(row)

    if not per_image_rows:
        print("\nNothing was scored.")
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)

    # Per-image detail.
    fieldnames = list(per_image_rows[0].keys())

    for row in per_image_rows:
        for name in row:
            if name not in fieldnames:
                fieldnames.append(name)

    per_image_path = out_dir / "per_image.csv"

    with per_image_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(per_image_rows)

    # Ensemble first, then the individual voters.
    ordered_keys = [ENSEMBLE_KEY] + sorted(k for k in tallies if k != ENSEMBLE_KEY)

    header = (
        f"| {'Engine':24} | {'Exact match':>11} | {'Char accuracy':>13} "
        f"| {'Length correct':>14} | {'Mean conf':>9} |"
    )
    divider = f"|{'-' * 26}|{'-' * 13}|{'-' * 15}|{'-' * 16}|{'-' * 11}|"

    lines = [header, divider]

    for key in ordered_keys:
        tally = tallies[key]

        if not tally["n"]:
            continue

        exact_pct = 100.0 * tally["exact"] / tally["n"]
        char_pct = 100.0 * tally["char_acc_sum"] / tally["n"]
        length_pct = 100.0 * tally["length_ok"] / tally["n"]
        mean_conf = tally["conf_sum"] / tally["n"]

        # The full architecture names overflow the column, and truncating them makes
        # the two TPS variants indistinguishable. Fall back to the short engine key,
        # which is unique and ASCII-safe for a Windows console.
        label = tally["label"] if len(tally["label"]) <= 24 else key

        lines.append(
            f"| {label:24} | {exact_pct:10.1f}% | {char_pct:12.1f}% "
            f"| {length_pct:13.1f}% | {mean_conf:9.3f} |"
        )

    n_scored = len(per_image_rows)

    print("")
    print(f"RESULTS over {n_scored} photo(s)")
    print("")
    print("\n".join(lines))

    if missing_files:
        print(f"\n{missing_files} labelled file(s) were not found in {images_dir}.")

    # Confidence calibration for the shipped answer. The UI auto-marks a reading
    # verified at >= 97% confidence, so it matters whether that threshold is honest.
    buckets = [(0.97, 1.01), (0.90, 0.97), (0.75, 0.90), (0.0, 0.75)]
    calib_lines = [
        f"| {'Ensemble confidence':22} | {'Photos':>6} | {'Exact match':>11} |",
        f"|{'-' * 24}|{'-' * 8}|{'-' * 13}|",
    ]

    for low, high in buckets:
        in_bucket = [
            row
            for row in per_image_rows
            if low <= float(row.get(f"{ENSEMBLE_KEY}_confidence", 0.0)) < high
        ]

        if not in_bucket:
            continue

        correct = sum(int(row.get(f"{ENSEMBLE_KEY}_exact", 0)) for row in in_bucket)
        label = f">= {low:.0%}" if high > 1.0 else f"{low:.0%} to {high:.0%}"

        calib_lines.append(
            f"| {label:22} | {len(in_bucket):6} | "
            f"{100.0 * correct / len(in_bucket):10.1f}% |"
        )

    print("")
    print("CONFIDENCE CALIBRATION (shipped ensemble)")
    print("")
    print("\n".join(calib_lines))

    confusion_path = out_dir / "confusion.csv"

    with confusion_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["true_digit", "predicted_digit", "count"])

        for (expected, got), count in confusion.most_common():
            writer.writerow([expected, got, count])

    if confusion:
        print("")
        print("MOST COMMON DIGIT CONFUSIONS (ensemble, length-matched reads)")

        for (expected, got), count in confusion.most_common(8):
            print(f"  {expected} read as {got}: {count}")

    summary_path = out_dir / "summary.md"

    with summary_path.open("w", encoding="utf-8") as handle:
        handle.write(f"# OCR accuracy\n\n")
        handle.write(f"Measured on {n_scored} hand-labelled meter photo(s).\n\n")
        handle.write("\n".join(lines))
        handle.write("\n\n## Confidence calibration\n\n")
        handle.write("\n".join(calib_lines))
        handle.write("\n")

    print("")
    print("Written:")
    print(f"  {per_image_path}")
    print(f"  {summary_path}")
    print(f"  {confusion_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
