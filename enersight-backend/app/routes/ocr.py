"""
EnerSight Meter OCR  — v8

Every reading is decided by an ensemble of four engines, all run on each photo:

  EasyOCR                            – anchor; several preprocessing variants, voted
  CRNN + CTC                         – trained on the capstone kWh meter dataset
  TPS + ResNet + BiLSTM + Attention  – same
  TPS + ResNet + BiLSTM + CTC        – same (best on the held-out split)

Pipeline
────────
1. Smart watermark strip  – detect blue "Bood No." overlay, remove top strip
2. Digit-row localisation – binarise, find the display, isolate the digit band
3. Ensemble               – all four engines read, then _run_ensemble reconciles them

The trained models live in app/ocr_models/ and load lazily from checkpoints that
are not committed (see app/ocr_models/weights/README.md); any that are missing are
simply skipped, leaving EasyOCR to answer on its own.

Step 2's helpers (_binarise_full, _find_display_binary, _find_digit_band) were
originally written for a seven-segment classifier. That classifier was never wired
into the pipeline and has been removed; the helpers stay because they build the
tight digit crop the trained models expect.
"""

import logging
import re
import uuid
from collections import Counter
from pathlib import Path

import cv2
import easyocr
import numpy as np
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user, require_admin_or_staff
from ..models import User
from ..ocr_models.inference import VARIANTS as _DTRB_VARIANTS
from ..ocr_models.inference import available_variants as _dtrb_available
from ..ocr_models.inference import predict as _dtrb_predict

# Force-load .env from the backend root (works regardless of cwd). Keeps the
# optional *_MODEL_PATH overrides read by ocr_models/inference.py available.
_env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ocr", tags=["OCR"])

# Anchored to the backend root rather than the process working directory, so photos
# land in the same place no matter where uvicorn was started from.
UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads" / "meter_photos"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Where the saved photos are served from. Must match the StaticFiles mount in
# app/main.py; a reading's image_path is built from this.
UPLOAD_URL_PREFIX = "/uploads/meter_photos"

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

# A phone photo of a meter is well under 10 MB. Without a cap, copyfileobj below
# would stream an arbitrarily large body to disk, and the pipeline would then feed
# whatever it was to eight model inferences.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 1024 * 1024

MIN_RELIABLE_CONFIDENCE = 0.70
MIN_DIGITS = 3
MAX_DIGITS = 8

_SPEC_BLACKLIST = {"3200", "2400", "1000", "0000", "240", "120", "50"}

# ── EasyOCR singleton ─────────────────────────────────────────────────────────

_reader: easyocr.Reader | None = None

def _get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        try:
            _reader = easyocr.Reader(["en"], gpu=False)
        except Exception as exc:
            raise HTTPException(500, f"EasyOCR init failed: {exc}")
    return _reader

# ── Basic image helpers ───────────────────────────────────────────────────────

def _load(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise HTTPException(400, "Cannot read image. Upload JPG, PNG, or WEBP.")
    return img

def _upscale(img: np.ndarray, min_w: int = 1400) -> np.ndarray:
    h, w = img.shape[:2]
    if w < min_w:
        s = min_w / w
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    return img

def _has_blue_watermark(img: np.ndarray) -> bool:
    """Detect the blue 'Bood No. …' camera overlay in the top 12 % of the frame."""
    h = img.shape[0]
    top = img[:max(1, int(h * 0.12)), :]
    hsv = cv2.cvtColor(top, cv2.COLOR_BGR2HSV)
    blue = cv2.inRange(hsv, (95, 80, 80), (135, 255, 255))
    return float(np.mean(blue > 0)) > 0.003

def _strip_watermark(img: np.ndarray) -> np.ndarray:
    """Remove watermark strip only when the blue overlay is actually detected."""
    if _has_blue_watermark(img):
        h = img.shape[0]
        return img[int(h * 0.09):, :]
    return img


# ═════════════════════════════════════════════════════════════════════════════
# DIGIT LOCALISATION
# ═════════════════════════════════════════════════════════════════════════════
#
# A seven-segment classifier used to live here: _SEG_REGIONS, _SEG_TO_DIGIT,
# _find_cells, _read_cell and _classify_seven_segment, about 180 lines. It was
# defined and never called from anywhere. Recover it from git history if a
# segment-based reader is ever wanted.

# ── Steps 1 + 2: binarise full image → find display → crop interior ──────────

def _binarise_full(img: np.ndarray) -> tuple[np.ndarray, str]:
    """
    Adaptive-threshold binarisation of the full upscaled image.
    Returns (binary, display_type).
    Segments / digit strokes → WHITE.  Background → BLACK.
    """
    gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w  = gray.shape
    mean_v = float(np.mean(gray[h // 3: 2 * h // 3, w // 4: 3 * w // 4]))
    dtype  = "light" if mean_v >= 90 else "dark"

    # Block = roughly half a digit width; must be odd, clamped to [21, 81]
    block = max(21, min(81, (w // 12) | 1))

    adaptive = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block,
        8,   # segments must be ≥8 levels darker than local neighbourhood
    )
    # adaptive: background → white, dark segments → black.
    binary = cv2.bitwise_not(adaptive) if dtype == "light" else adaptive
    return binary, dtype


def _find_display_binary(binary: np.ndarray) -> tuple[np.ndarray, tuple | None, tuple[int, int]]:
    """
    Locate the LCD display window inside the full binary image using
    connected-component bounding boxes, then return a crop with the
    display FRAME removed.

    Returns (cropped, best_box, (offset_x, offset_y)) where the offset is the
    top-left of `cropped` within `binary`. The offset is NOT derivable from
    best_box — the crop is inset by the frame padding, and both fallback paths
    crop by a fixed fraction while reporting no box at all — so callers that
    need to map coordinates back to the source image must use it.
    """
    h, w = binary.shape

    # If image is already a wide digit strip (user cropped tightly), use it as-is.
    # Applying a fixed-fraction crop on an already-tight crop destroys digits.
    if w / (h + 1) > 2.5:
        return binary, None, (0, 0)
    _, _, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)

    best_score, best_box = 0.0, None
    for i in range(1, len(stats)):
        cx  = stats[i, cv2.CC_STAT_LEFT]
        cy  = stats[i, cv2.CC_STAT_TOP]
        cw  = stats[i, cv2.CC_STAT_WIDTH]
        ch  = stats[i, cv2.CC_STAT_HEIGHT]
        area = stats[i, cv2.CC_STAT_AREA]
        bbox = cw * ch

        if bbox < w * h * 0.04 or bbox > w * h * 0.75:
            continue
        asp = cw / (ch + 1e-6)
        if asp < 1.5 or asp > 10:
            continue

        cy_n     = (cy + ch / 2) / h
        pos      = max(0.0, 1.0 - abs(cy_n - 0.40) * 2.5)
        density  = area / bbox
        score    = (bbox / (w * h)) * (2.0 if 2 <= asp <= 7 else 1.0) * (1.0 + pos) * max(density, 0.1)
        if score > best_score:
            best_score, best_box = score, (cx, cy, cw, ch)

    if best_box is None:
        y0, y1 = int(h * 0.05), int(h * 0.62)
        x0, x1 = int(w * 0.08), int(w * 0.92)
        return binary[y0:y1, x0:x1], None, (x0, y0)

    x, y, cw, ch = best_box
    py = max(8, int(ch * 0.07))
    px = max(8, int(cw * 0.04))
    y1c, y2c = max(0, y + py), min(h, y + ch - py)
    x1c, x2c = max(0, x + px), min(w, x + cw - px)

    cropped = binary[y1c:y2c, x1c:x2c]
    if cropped.size == 0:
        y0, y1 = int(h * 0.05), int(h * 0.62)
        x0, x1 = int(w * 0.08), int(w * 0.92)
        return binary[y0:y1, x0:x1], None, (x0, y0)
    return cropped, best_box, (x1c, y1c)


# ── Step 3: digit band ───────────────────────────────────────────────────────

def _find_digit_band(binary: np.ndarray) -> tuple[np.ndarray, int]:
    """
    Isolate the horizontal row of the main (tallest) digit shapes.
    Rejects smaller indicators (EC, cursor) and labels (kWh).
    Returns (band, y_offset_in_binary).
    """
    h, w = binary.shape
    num_lbl, _, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)

    min_h   = h * 0.22
    tall_y0 = []
    tall_y1 = []
    for i in range(1, num_lbl):
        ch = stats[i, cv2.CC_STAT_HEIGHT]
        cw = stats[i, cv2.CC_STAT_WIDTH]
        if ch >= min_h and cw >= 4:
            cy0 = stats[i, cv2.CC_STAT_TOP]
            tall_y0.append(cy0)
            tall_y1.append(cy0 + ch)

    if not tall_y0:
        return binary, 0

    y_min = max(0,  min(tall_y0) - int(h * 0.06))
    y_max = min(h,  max(tall_y1) + int(h * 0.06))
    return binary[y_min:y_max, :], y_min


def _prepare_dtrb_crop(img: np.ndarray) -> np.ndarray:
    """
    Tight crop around the digit row, for the trained DTRB models.

    Those models were trained on tightly-cropped digit rows, so feeding them the
    whole photo reads poorly. The display/digit-band localisation above already
    solves exactly this, so reuse its coordinates — but slice them out of the
    original image rather than the binary: the VGG/ResNet backbones can use the
    greyscale detail that binarising throws away.

    Falls back to the full image whenever localisation fails; unlike the
    seven-segment path this runs on every request, so it must never raise.
    """
    try:
        work = _upscale(img, min_w=1400)
        binary_full, _ = _binarise_full(work)
        binary, _, (dx, dy) = _find_display_binary(binary_full)
        band, y_off = _find_digit_band(binary)
        if band.size == 0:
            return work

        cols = np.where(np.sum(band > 0, axis=0) > 0)[0]
        if cols.size == 0:
            return work
        x0, x1 = int(cols.min()), int(cols.max()) + 1
        y0, y1 = y_off, y_off + band.shape[0]

        # Band/column coords are relative to the display crop — (dx, dy) shifts
        # them back into `work` space.
        pad_y = max(2, int((y1 - y0) * 0.08))
        pad_x = max(2, int((x1 - x0) * 0.04))
        crop = work[
            max(0, dy + y0 - pad_y):min(work.shape[0], dy + y1 + pad_y),
            max(0, dx + x0 - pad_x):min(work.shape[1], dx + x1 + pad_x),
        ]
        return crop if crop.size else work
    except Exception as exc:
        logger.warning("DTRB crop preparation failed, using full image: %s", exc)
        return img


# ═════════════════════════════════════════════════════════════════════════════
# EASYOCR FALLBACK  (drum-wheel / dark-bg meters)
# ═════════════════════════════════════════════════════════════════════════════

_LCD_MAP = {
    "O": "0", "o": "0", "D": "0",
    "B": "8", "b": "6",
    "G": "6", "g": "9",
    "S": "5", "s": "5",
    "Z": "2", "z": "2",
    "I": "1", "l": "1", "i": "1",
    "T": "7",
    "A": "4",
}

_OCR_KW = dict(
    allowlist="0123456789",
    detail=1,
    paragraph=False,
    text_threshold=0.45,
    low_text=0.30,
    link_threshold=0.25,
    canvas_size=2560,
    mag_ratio=1.2,
    add_margin=0.10,
)


def _clean(text: str) -> str:
    out = []
    for ch in text:
        if ch.isdigit():
            out.append(ch)
        elif ch.upper() in _LCD_MAP:
            out.append(_LCD_MAP[ch.upper()])
    return "".join(out)


def _valid(d: str) -> bool:
    return MIN_DIGITS <= len(d) <= MAX_DIGITS and d not in _SPEC_BLACKLIST and len(set(d)) > 1


def _score_easyocr(digits: str, conf: float, bh_norm: float) -> float:
    n = len(digits)
    if not _valid(digits):
        return -1000.0
    size  = min(bh_norm * 1000.0, 250.0)
    count = {5: 70, 6: 70, 7: 55, 4: 45, 8: 30, 3: 8}.get(n, 0)
    return size + count + conf * 55.0 - (200 if n <= 2 else 30 if n == 3 else 0)


def _easyocr_read(img: np.ndarray) -> tuple[str, float]:
    """
    EasyOCR pass on a prepared crop.
    Returns (best_digits, confidence) or ("", 0.0).
    """
    reader = _get_reader()
    img = _upscale(img, min_w=1400)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ce   = cv2.createCLAHE(3.0, (8, 8)).apply(gray)
    enh  = cv2.cvtColor(
        cv2.addWeighted(ce, 2.5, cv2.GaussianBlur(ce, (0, 0), 3), -1.5, 0),
        cv2.COLOR_GRAY2BGR,
    )
    inv = cv2.cvtColor(
        cv2.bitwise_not(
            cv2.threshold(
                cv2.morphologyEx(enh[:, :, 0], cv2.MORPH_CLOSE,
                                 cv2.getStructuringElement(cv2.MORPH_RECT, (5, 2))),
                0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
            )[1]
        ),
        cv2.COLOR_GRAY2BGR,
    )

    # Bilateral filter + tighter CLAHE — preserves digit edges, reduces noise
    bilat = cv2.bilateralFilter(gray, 9, 75, 75)
    ce2   = cv2.createCLAHE(4.0, (4, 4)).apply(bilat)
    bilat_enh = cv2.cvtColor(
        cv2.addWeighted(ce2, 2.0, cv2.GaussianBlur(ce2, (0, 0), 2), -1.0, 0),
        cv2.COLOR_GRAY2BGR,
    )

    # Adaptive threshold — handles uneven lighting across the display
    adapt = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 5
    )
    adapt_bgr = cv2.cvtColor(adapt, cv2.COLOR_GRAY2BGR)

    all_cands: list[dict] = []
    for vimg in (img, enh, inv, bilat_enh, adapt_bgr):
        h = vimg.shape[0]
        try:
            raw = reader.readtext(vimg, **_OCR_KW)
        except Exception:
            continue
        for bbox, text, conf in raw:
            d = _clean(text)
            if not _valid(d):
                continue
            ys  = [p[1] for p in bbox]
            bh  = float(max(ys) - min(ys))
            s   = _score_easyocr(d, float(conf), bh / h if h else 0.05)
            all_cands.append({"d": d, "c": float(conf), "s": s})

    if not all_cands:
        return "", 0.0

    votes: Counter = Counter(c["d"] for c in all_cands)
    for c in all_cands:
        if votes[c["d"]] >= 2:
            c["s"] += votes[c["d"]] * 20

    all_cands.sort(key=lambda x: x["s"], reverse=True)
    best = all_cands[0]
    return best["d"], best["c"]


# ═════════════════════════════════════════════════════════════════════════════
# ENSEMBLE  (EasyOCR + the three capstone-trained DTRB models)
# ═════════════════════════════════════════════════════════════════════════════

# EasyOCR is the anchor; the trained models corroborate it.
#
# The capstone benchmark ranked the trained models far above EasyOCR (91 / 84 / 82 %
# char accuracy vs 14.4 %), but that was measured on a held-out split of the same
# Roboflow dataset they were trained on. On the real meter photos in uploads/ the
# ranking inverts: EasyOCR read 087654 exactly right while all three trained models
# missed, truncating to 4-5 digits ("0870", "000") — they never saw readings this
# long or these LCD styles in training. Worse, they miss *confidently*: TPS+CTC
# returned "0870" at 0.998.
#
# So a single trained model must never be able to overrule EasyOCR on confidence
# alone. It takes corroboration: at least this many of them agreeing on the same
# string. With three models installed that means a majority of them.
_MIN_TRAINED_VOTES_TO_OVERRIDE = 2

# Ranking weight among the trained models themselves (their benchmark char
# accuracies live on each variant in ocr_models/inference.py). EasyOCR's weight is
# only used so its row in the response is comparable; the decision rule below, not
# this number, is what protects its answer.
_EASYOCR_STATIC_WEIGHT = 0.90

# Each extra voter that agrees lifts confidence by this much (multiplicative).
_AGREEMENT_BONUS = 0.05
_MAX_ENSEMBLE_CONFIDENCE = 0.995


def _run_ensemble(img: np.ndarray) -> dict:
    """
    Read the meter with every available engine and reconcile them into one answer.

    Voters: EasyOCR (full image, existing pipeline) plus each trained DTRB model
    that has a checkpoint installed (tight digit crop, which is what they expect).

    Candidates are grouped by exact digit string, and the answer is decided by:

      1. no valid reading anywhere            -> nothing
      2. EasyOCR has none                     -> best-scoring trained group
      3. trained models back EasyOCR's string -> that, with an agreement bonus
      4. >= _MIN_TRAINED_VOTES_TO_OVERRIDE trained models agree on something else
                                              -> that group overrules EasyOCR
      5. otherwise                            -> EasyOCR

    Rules 4 and 5 are the point: on the real photos a lone trained model is often
    both wrong and confident, so overruling EasyOCR takes corroboration from its
    peers rather than a high score. See the constants above.

    Degrades cleanly — with no checkpoints installed the only voter is EasyOCR and
    the result matches the previous EasyOCR-only fallback.
    """
    dtrb_crop = _prepare_dtrb_crop(img)

    voters: list[dict] = []

    eocr_digits, eocr_conf = _easyocr_read(img)
    voters.append({
        "source":              "easyocr",
        "label":               "EasyOCR",
        "digits":              eocr_digits,
        "instance_confidence": round(float(eocr_conf), 4),
        "static_weight":       _EASYOCR_STATIC_WEIGHT,
    })

    for variant in _DTRB_VARIANTS:
        digits, conf = _dtrb_predict(variant.key, dtrb_crop)
        voters.append({
            "source":              variant.key,
            "label":               variant.label,
            "digits":              digits,
            "instance_confidence": round(float(conf), 4),
            "static_weight":       variant.static_weight,
        })

    for voter in voters:
        voter["valid"] = bool(voter["digits"]) and _valid(voter["digits"])
        voter["weighted_score"] = round(
            voter["static_weight"] * voter["instance_confidence"], 4
        )
        voter["chosen"] = False

    scored = [v for v in voters if v["valid"]]
    if not scored:
        return {
            "candidate":   "",
            "confidence":  0.0,
            "method":      "ensemble_none",
            "all_candidates": [],
            "raw_text":    "ensemble: no engine produced a valid reading",
            "ensemble_candidates": voters,
        }

    groups: dict[str, list[dict]] = {}
    for voter in scored:
        groups.setdefault(voter["digits"], []).append(voter)

    easyocr_read = next(
        (v["digits"] for v in scored if v["source"] == "easyocr"), None
    )

    # Rank the trained models' answers among themselves, best first.
    trained_groups = sorted(
        (
            (digits, [v for v in members if v["source"] != "easyocr"])
            for digits, members in groups.items()
        ),
        key=lambda item: (len(item[1]), sum(v["weighted_score"] for v in item[1])),
        reverse=True,
    )
    best_trained = next(((d, m) for d, m in trained_groups if m), None)

    if easyocr_read is None:
        winner, decision = best_trained[0], "easyocr found nothing; trained models decided"
    elif best_trained and best_trained[0] == easyocr_read:
        winner, decision = easyocr_read, "trained models agreed with easyocr"
    elif best_trained and len(best_trained[1]) >= _MIN_TRAINED_VOTES_TO_OVERRIDE:
        winner = best_trained[0]
        decision = (
            f"{len(best_trained[1])} trained models overruled easyocr "
            f"({easyocr_read})"
        )
    else:
        winner, decision = easyocr_read, "easyocr led; no corroborated alternative"

    members = groups[winner]
    for voter in members:
        voter["chosen"] = True

    mean_confidence = sum(v["instance_confidence"] for v in members) / len(members)
    confidence = min(
        _MAX_ENSEMBLE_CONFIDENCE,
        mean_confidence * (1.0 + _AGREEMENT_BONUS * (len(members) - 1)),
    )

    all_candidates = sorted(
        (
            {
                "candidate":  v["digits"],
                "confidence": v["instance_confidence"],
                "score":      v["weighted_score"],
                "variant":    v["source"],
            }
            for v in scored
        ),
        key=lambda c: c["score"],
        reverse=True,
    )

    agreeing = "+".join(sorted(v["source"] for v in members))
    return {
        "candidate":   winner,
        "confidence":  round(confidence, 4),
        "method":      f"ensemble[{agreeing}]",
        "all_candidates": all_candidates,
        "ensemble_decision": decision,
        "raw_text":    (
            f"ensemble winner={winner} "
            f"({len(members)}/{len(scored)} valid engines agreed; {decision})"
        ),
        "ensemble_candidates": voters,
    }


# ═════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═════════════════════════════════════════════════════════════════════════════

def run_ocr(image_path: str) -> dict:
    raw = _load(image_path)
    img = _strip_watermark(raw)
    img = _upscale(img, min_w=1400)

    # ── EasyOCR anchored by the trained models ────────────────────────────
    # EasyOCR gets the full image (the user's crop is already tight around the
    # digits, so cropping further would cut them off); _run_ensemble hands the
    # trained models their own tight crop.
    ensemble = _run_ensemble(img)
    if ensemble["candidate"] and _valid(ensemble["candidate"]):
        return ensemble

    return {
        "candidate": "", "confidence": 0.0, "method": "none",
        "all_candidates": [],
        "raw_text": f"no reading found ({ensemble['raw_text']})",
        "ensemble_candidates": ensemble.get("ensemble_candidates", []),
    }


# ═════════════════════════════════════════════════════════════════════════════
# LCD CORRECTION  (applied after reading regardless of method)
# ═════════════════════════════════════════════════════════════════════════════

def _lcd_correct(digits: str) -> tuple[str, bool, str]:
    """
    Conservative LCD correction, applied to every ensemble result.
    Only fixes clearly impossible patterns (e.g. "888xx" start where
    three-segment confusion is statistically certain).
    """
    if not digits or len(digits) < MIN_DIGITS:
        return digits, False, ""
    orig = digits
    # "888" at the very start of a 6-8 digit reading is statistically
    # three consecutive 0-vs-8 segment errors, not a valid 888xxxx reading.
    if len(digits) >= 3 and digits[:3] == "888" and 6 <= len(digits) <= 8:
        digits = "000" + digits[3:]
    changed = digits != orig
    return digits, changed, (f"LCD correction: {orig!r} → {digits!r}" if changed else "")


def _ambiguous(digits: str, conf: float) -> bool:
    return conf < 0.75 and any(d in {"0", "8", "6"} for d in digits)


# ═════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/health")
# Authenticated: this reports the engine inventory and the confidence thresholds,
# and calling it loads EasyOCR plus every installed checkpoint (~400 MB). As an
# anonymous endpoint it was both an information leak and a free way to make the
# server do a lot of work.
def ocr_health_check(_: User = Depends(get_current_user)):
    try:
        reader = _get_reader()
        dtrb_loaded = _dtrb_available()
        return {
            "message":           "OCR route is active",
            "ocr_engine":        "EasyOCR + trained-model ensemble",
            "easyocr_ready":     reader is not None,
            # Which trained checkpoints are installed; false ones are skipped by
            # the ensemble. See app/ocr_models/weights/README.md.
            "dtrb_variants_loaded": dtrb_loaded,
            "trained_models_installed": sum(dtrb_loaded.values()),
            "min_digits":        MIN_DIGITS,
            "max_digits":        MAX_DIGITS,
            "min_confidence":    MIN_RELIABLE_CONFIDENCE,
            "watermark_strip":   "auto (blue-pixel detection)",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Health check failed: {exc}")


@router.post("/meter-photo")
# Deliberately a plain `def`, not `async def`. Everything below is synchronous and
# CPU-bound (disk write, 5 EasyOCR passes, 3 torch forward passes). FastAPI runs
# `async def` handlers on the event loop, so an async version would freeze every
# other request for the 5-20s this takes; a plain `def` gets the threadpool.
def read_meter_photo(
    file: UploadFile = File(...),
    _: User = Depends(require_admin_or_staff),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Invalid file type. Upload JPG, PNG, or WEBP.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"

    saved_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"

    try:
        # Stream with a running total rather than shutil.copyfileobj, so an
        # oversized body is rejected instead of being written to disk in full.
        written = 0

        with saved_path.open("wb") as buf:
            while True:
                chunk = file.file.read(UPLOAD_CHUNK_BYTES)

                if not chunk:
                    break

                written += len(chunk)

                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        413,
                        f"Photo is larger than "
                        f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB. "
                        "Please upload a smaller image.",
                    )

                buf.write(chunk)

        if written == 0:
            raise HTTPException(400, "The uploaded file is empty.")

        result      = run_ocr(str(saved_path))
        raw_reading = result["candidate"]
        confidence  = float(result["confidence"])
        conf_pct    = round(confidence * 100, 2)
        method      = result["method"]

        if not raw_reading:
            # No reading means no record will be saved, so keeping the photo would
            # just accumulate orphans.
            saved_path.unlink(missing_ok=True)

            return {
                "success":       False,
                "needs_review":  True,
                "message":       "No meter reading detected. Upload a clearer, well-lit photo.",
                "ocr_engine":    method,
                "reading_value": "",
                "raw_reading_value":       "",
                "corrected_reading_value": "",
                "correction_applied":      False,
                "ocr_accuracy":  0,
                "raw_text":      result["raw_text"],
                # Nothing will reference this photo, so it is cleaned up below.
                "image_path":    "",
                "original_filename": file.filename or "",
                "all_candidates": [],
                "ensemble_candidates": result.get("ensemble_candidates", []),
                "review_reason": "No valid meter reading candidate was detected.",
            }

        corrected, changed, corr_reason = _lcd_correct(raw_reading)
        low_conf  = confidence < MIN_RELIABLE_CONFIDENCE
        ambiguous = _ambiguous(raw_reading, confidence)

        reading_value = re.sub(r"[^0-9]", "", corrected)

        needs_review = low_conf or ambiguous or changed

        reasons: list[str] = []
        if changed:
            reasons.append(corr_reason)
        if ambiguous:
            reasons.append("Low-confidence reading with 0/8/6 digits — please verify.")
        if low_conf:
            reasons.append(f"Confidence {conf_pct}% is below {round(MIN_RELIABLE_CONFIDENCE*100)}%.")
        if not reasons:
            reasons.append("Confidence passed the reliable threshold.")

        return {
            "success":       True,
            "needs_review":  needs_review,
            "message":       (
                "Meter reading detected — manual verification recommended."
                if needs_review else "Meter reading detected successfully."
            ),
            "ocr_engine":    method,
            "reading_value": reading_value,
            "raw_reading_value":       raw_reading,
            "corrected_reading_value": corrected,
            "correction_applied":      changed,
            "ocr_accuracy":            conf_pct,
            "raw_text":                result["raw_text"],
            # The path the photo is actually served from, so a saved reading can be
            # traced back to its evidence. This used to be the raw client filename,
            # which pointed at nothing because the file was deleted on the way out.
            "image_path":              f"{UPLOAD_URL_PREFIX}/{saved_path.name}",
            "original_filename":       file.filename or "",
            "all_candidates":          result["all_candidates"],
            # What each engine read, and which one the ensemble went with.
            "ensemble_candidates":     result.get("ensemble_candidates", []),
            "ensemble_decision":       result.get("ensemble_decision", ""),
            "review_reason":           " ".join(reasons),
            "minimum_reliable_confidence": MIN_RELIABLE_CONFIDENCE,
        }

    except HTTPException:
        # Nothing will reference a rejected upload.
        saved_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        saved_path.unlink(missing_ok=True)
        raise HTTPException(500, f"OCR processing failed: {exc}")
