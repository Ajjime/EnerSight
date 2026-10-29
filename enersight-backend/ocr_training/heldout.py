"""Held-out test sets. Nothing here is ever used for training.

campus_rows   digit rows hand-cropped from the four labelled photos in eval_data/
              (two of them the campus Aclara and Vision meters), each also cropped
              five more times with jittered margins.
production    what the OCR pipeline actually hands the trained models after a user
              crops a photo: the region EasyOCR's detector found, widened
              (routes/ocr.py _dtrb_crop_around). Saved in heldout/production/.
roboflow_test the original Roboflow test split, behind the figures in the paper.
              Not in the repo; pass the extracted export's test/ folder.

The campus sets cover only four meters, and their failures were used to decide
what the synthetic renderer draws, so treat their scores as optimistic. The honest
measure is readings exported from real use (export_ocr_dataset.py).
"""
import csv
import random
from pathlib import Path

import cv2

from .data import build_crops

HERE = Path(__file__).parent
EVAL_IMAGES = HERE.parent / "eval_data" / "images"

# Hand-drawn digit-row boxes (x0, y0, x1, y1) on the eval_data photos.
CAMPUS_ROWS = [
    ("0954eef9bba345258fd55ce64797bc89.jpg", (750, 565, 1160, 705), "00653"),   # campus Aclara
    ("4850b837e63d47fea7fdb0489a66ad8d.jpg", (560, 545, 990, 680), "11847"),    # campus Vision
    ("1a052d1089aa4f9487654bdc48cde988.png", (380, 38, 670, 128), "087654"),
    ("44db66f2bab44e0c921584b8c94f554e.png", (200, 215, 612, 330), "0009732"),
]


def campus_rows(jitters: int = 5, seed: int = 7):
    rng = random.Random(seed)
    out = []
    for fname, (x0, y0, x1, y1), label in CAMPUS_ROWS:
        img = cv2.imread(str(EVAL_IMAGES / fname))
        if img is None:
            raise FileNotFoundError(EVAL_IMAGES / fname)
        H, W = img.shape[:2]
        out.append((img[y0:y1, x0:x1], label))
        h, w = y1 - y0, x1 - x0
        for _ in range(jitters):
            top, bottom = int(h * rng.uniform(-0.1, 0.25)), int(h * rng.uniform(-0.1, 0.25))
            left, right = int(w * rng.uniform(-0.03, 0.12)), int(w * rng.uniform(-0.03, 0.12))
            out.append((img[max(0, y0 - top):min(H, y1 + bottom),
                             max(0, x0 - left):min(W, x1 + right)], label))
    return out


def production():
    folder = HERE / "heldout" / "production"
    with open(folder / "labels.csv", newline="") as handle:
        return [(cv2.imread(str(folder / row["filename"])), row["true_reading"])
                for row in csv.DictReader(handle)]


def all_sets(roboflow_test=None) -> dict:
    sets = {"campus_rows": campus_rows(), "production": production()}
    if roboflow_test:
        sets["roboflow_test"] = build_crops(roboflow_test)
    return sets
