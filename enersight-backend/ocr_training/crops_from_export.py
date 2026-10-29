"""Turn exported campus readings into digit-row crops the models can train on.

export_ocr_dataset.py writes the photos people uploaded (usually a crop of the whole
display) with the value they confirmed. The models train on digit rows, so this
runs the same step the live pipeline runs (EasyOCR's detector, then
_dtrb_crop_around) and saves each row crop with its label.

From enersight-backend/:

    python export_ocr_dataset.py --verified-only
    python -m ocr_training.crops_from_export ocr_dataset ocr_training/runs/campus_crops
    python -m ocr_training.train ... --real-crops ocr_training/runs/campus_crops

Check a sample of the crops before training: a photo where the detector picked the
wrong text gives a crop that does not match its label.
"""
import argparse
import csv
import sys
from pathlib import Path

import cv2

from app.routes import ocr as O


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("export_dir", help="Output folder of export_ocr_dataset.py.")
    p.add_argument("out_dir")
    args = p.parse_args()

    source, out = Path(args.export_dir), Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    with open(source / "labels.csv", newline="") as handle:
        rows = list(csv.DictReader(handle))

    written, skipped = [], 0
    for row in rows:
        img = cv2.imread(str(source / "images" / row["filename"]))
        if img is None:
            skipped += 1
            continue
        work = O._upscale(O._strip_watermark(img), 1400)
        _, _, box = O._easyocr_read(work)
        if box is None:
            skipped += 1            # nothing detected, so no row to train on
            continue
        name = Path(row["filename"]).stem + "_row.png"
        cv2.imwrite(str(out / name), O._dtrb_crop_around(work, box))
        written.append({"filename": name, "true_reading": row["true_reading"]})
        print(f"  {name}: {row['true_reading']}", flush=True)

    with open(out / "labels.csv", "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["filename", "true_reading"])
        writer.writeheader()
        writer.writerows(written)
    print(f"{len(written)} row crops written to {out}; {skipped} skipped (no text found).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
