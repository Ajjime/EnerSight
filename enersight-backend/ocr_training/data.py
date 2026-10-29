"""Digit-row crops from Roboflow exports, and the scores the capstone reports."""
import csv
from collections import defaultdict
from pathlib import Path

import cv2


def build_crops(split_dir, pad: int = 15):
    """Digit-row crops from a Roboflow TensorFlow export split (a folder with the
    images and _annotations.csv), built exactly as the Colab training notebook built
    them: the union of the digit boxes plus 15 px, labelled by sorting the boxes'
    classes left to right. Returns [(bgr image, label)].
    """
    split_dir = Path(split_dir)
    boxes = defaultdict(list)
    with open(split_dir / "_annotations.csv", newline="") as handle:
        for row in csv.DictReader(handle):
            cls = str(row["class"]).strip()
            if cls.isdigit():
                boxes[row["filename"]].append((
                    int(float(row["xmin"])), int(float(row["ymin"])),
                    int(float(row["xmax"])), int(float(row["ymax"])), cls,
                ))

    crops = []
    for fname in sorted(boxes):
        group = boxes[fname]
        img = cv2.imread(str(split_dir / fname))
        if img is None:
            continue
        H, W = img.shape[:2]
        x0 = max(0, min(b[0] for b in group) - pad)
        y0 = max(0, min(b[1] for b in group) - pad)
        x1 = min(W, max(b[2] for b in group) + pad)
        y1 = min(H, max(b[3] for b in group) + pad)
        crop = img[y0:y1, x0:x1]
        label = "".join(b[4] for b in sorted(group, key=lambda b: b[0]))
        if crop.size and label.isdigit() and len(label) <= 10:
            crops.append((crop, label))
    return crops


def load_labelled_crops(folder):
    """Ready-made digit-row crops: a folder of images plus labels.csv with
    filename,true_reading (what crops_from_export.py writes). Returns [(bgr, label)]."""
    folder = Path(folder)
    crops = []
    with open(folder / "labels.csv", newline="") as handle:
        for row in csv.DictReader(handle):
            img = cv2.imread(str(folder / row["filename"]))
            label = row["true_reading"].strip()
            if img is not None and label.isdigit() and len(label) <= 10:
                crops.append((img, label))
    return crops


def levenshtein(a: str, b: str) -> int:
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def score(pairs) -> dict:
    """[(truth, prediction)] -> percentages.

    exact   every digit right, leading zeros included
    value   the right number (09732 counts for 0009732)
    char    1 - edit distance / length, the notebook's character accuracy
    """
    n = len(pairs)
    return {
        "n": n,
        "exact": 100 * sum(t == p for t, p in pairs) / n,
        "value": 100 * sum(bool(p) and int(p) == int(t) for t, p in pairs) / n,
        "char": 100 * sum(max(0.0, 1 - levenshtein(t, p) / len(t)) for t, p in pairs) / n,
    }
