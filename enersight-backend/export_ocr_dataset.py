"""Turn the readings people confirmed into a labelled set of campus meter photos.

Why this exists
---------------
The trained OCR models fail on the campus meters because they never saw one: every
dataset they were trained on is a different meter style. Nobody has to go out and
build a campus dataset for that, because the system collects one as it is used.
Each reading saved through the upload page keeps the photo (image_path), what OCR
read (ocr_reading) and the number the person saved (reading_value). The saved
number is the label. Where it differs from what OCR read, the person corrected a
misread, and those are the most useful photos of all.

This script exports them in the format evaluate_ocr.py reads, so the same folder
can serve as a bigger evaluation set or as training data for the trained models.

Usage
-----
From `enersight-backend/`:

    python export_ocr_dataset.py
    python export_ocr_dataset.py --verified-only     # only Admin/Manager-verified
    python evaluate_ocr.py --images ocr_dataset/images --labels ocr_dataset/labels.csv

Leading zeros
-------------
Readings are stored as numbers, so 00653 comes back as 653. The label is padded back
to the meter's display width, taken as the longest reading OCR returned for that
meter. If OCR always dropped the same leading zeros, the width is short too, so
check a few photos against their labels before training on them.
"""

import argparse
import csv
import shutil
import sys
from collections import defaultdict
from pathlib import Path

from sqlalchemy.exc import ProgrammingError

from app.database import SessionLocal
from app.models import ConsumptionRecord
from app.routes.ocr import UPLOAD_DIR, UPLOAD_URL_PREFIX


def photo_file(image_path: str | None) -> Path | None:
    """The uploaded photo a reading points at, if it is one and still exists."""
    prefix = UPLOAD_URL_PREFIX + "/"
    if not image_path or not image_path.startswith(prefix):
        return None
    # Only the file name is used, so a stored path can never reach outside the
    # uploads folder.
    candidate = UPLOAD_DIR / Path(image_path).name
    return candidate if candidate.is_file() else None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export confirmed OCR readings as labelled meter photos."
    )
    parser.add_argument("--out", default="ocr_dataset", help="Output folder.")
    parser.add_argument(
        "--verified-only",
        action="store_true",
        help="Only readings an Admin or Manager has verified.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        query = db.query(ConsumptionRecord).filter(
            ConsumptionRecord.ocr_reading.isnot(None)
        )
        if args.verified_only:
            query = query.filter(ConsumptionRecord.is_verified.is_(True))
        records = query.order_by(ConsumptionRecord.record_id).all()
    except ProgrammingError:
        print("The ocr_reading column does not exist yet. Start the API once; it")
        print("adds the column on startup.")
        return 1
    finally:
        db.close()

    # Display width per meter: the longest digit string OCR returned for it.
    width_by_meter: dict[int, int] = defaultdict(int)
    for record in records:
        width_by_meter[record.meter_id] = max(
            width_by_meter[record.meter_id], len(record.ocr_reading)
        )

    out_dir = Path(args.out)
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    skipped_no_photo = 0
    skipped_fraction = 0

    for record in records:
        source = photo_file(record.image_path)
        if source is None:
            skipped_no_photo += 1
            continue

        saved = float(record.reading_value)
        if not saved.is_integer():
            # The labels are digit strings; a value with a fraction was typed in by
            # hand and does not match any digit row on the display.
            skipped_fraction += 1
            continue

        digits = str(int(saved))
        label = digits.zfill(max(len(digits), width_by_meter[record.meter_id]))
        corrected = int(record.ocr_reading) != int(saved)

        shutil.copy2(source, images_dir / source.name)
        rows.append({
            "filename": source.name,
            "true_reading": label,
            "ocr_reading": record.ocr_reading,
            "corrected_by_person": int(corrected),
            "verified": int(bool(record.is_verified)),
            "meter_id": record.meter_id,
            "reading_date": record.reading_date.isoformat() if record.reading_date else "",
            "record_id": record.record_id,
        })

    labels_path = out_dir / "labels.csv"
    fieldnames = [
        "filename", "true_reading", "ocr_reading", "corrected_by_person",
        "verified", "meter_id", "reading_date", "record_id",
    ]
    with labels_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    corrected_count = sum(row["corrected_by_person"] for row in rows)
    meters = len({row["meter_id"] for row in rows})

    print(f"Exported {len(rows)} labelled photo(s) from {meters} meter(s) to {out_dir}/")
    print(f"  {corrected_count} of them were OCR misreads a person corrected.")
    if skipped_no_photo:
        print(f"  Skipped {skipped_no_photo}: photo missing from {UPLOAD_DIR}.")
    if skipped_fraction:
        print(f"  Skipped {skipped_fraction}: saved value has a fraction.")
    if not rows:
        print("Nothing to export yet. Readings saved through the upload page from")
        print("now on are collected automatically.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
