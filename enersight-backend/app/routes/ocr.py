"""
EnerSight Meter OCR  — v7

Primary:  Claude Vision API (claude-haiku) — handles all meter types with high accuracy.
          Requires ANTHROPIC_API_KEY in environment.
Secondary: Seven-segment cell classifier (OpenCV geometry, no ML required).
           Works for LCD / digital display meters.
Fallback:  EasyOCR for drum-wheel meters (solid-digit displays with dark bg).

Pipeline
────────
1. Smart watermark strip  – detect blue "Bood No." overlay, remove top strip
2. Claude Vision          – base64 image → Claude Haiku → numeric reading
3. Seven-segment pipeline – edge contour, binarise, cell segmentation, segment read
4. EasyOCR fallback       – triggered for dark-bg displays or if classifier fails
"""

import base64
import logging
import os
import re
import shutil
import uuid
from collections import Counter
from pathlib import Path

import cv2
import easyocr
import numpy as np
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import require_admin_or_staff
from ..models import User

# Force-load .env from the backend root (works regardless of cwd)
_env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ocr", tags=["OCR"])

UPLOAD_DIR = Path("uploads/meter_photos")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

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
# GEMINI VISION  (primary method — free tier available)
# ═════════════════════════════════════════════════════════════════════════════

def _gemini_vision_read(image_path: str, processed_img: np.ndarray | None = None) -> tuple[str, float, str]:
    """
    Use Google Gemini Flash to read the meter display.
    Free tier: 1,500 requests/day — no credit card needed.
    Get a free API key at https://aistudio.google.com
    Requires GEMINI_API_KEY in environment.
    If processed_img is provided, that ndarray is sent instead of the raw file.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return "", 0.0, "gemini: no API key set"

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return "", 0.0, "gemini: google-genai package not installed"

    try:
        client = genai.Client(api_key=api_key)

        if processed_img is not None:
            _, buf = cv2.imencode(".jpg", processed_img, [cv2.IMWRITE_JPEG_QUALITY, 95])
            image_data = buf.tobytes()
            mime_type = "image/jpeg"
        else:
            with open(image_path, "rb") as f:
                image_data = f.read()
            ext = Path(image_path).suffix.lower()
            mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                        ".png": "image/png", ".webp": "image/webp"}
            mime_type = mime_map.get(ext, "image/jpeg")

        _GEMINI_PROMPT = (
            "This is a cropped photo of an electricity meter LCD display showing a kWh reading. "
            "Read the main consumption number on the display. "
            "Rules:\n"
            "1. Return ONLY a digit string — no spaces, no units, no letters.\n"
            "2. If the display shows a decimal number like '02353.5', return ONLY the digits "
            "   before the decimal point: '02353'.\n"
            "3. Keep all leading zeros exactly as shown (e.g. '02353' not '2353').\n"
            "4. If there are two rows of numbers, read only the larger main row.\n"
            "5. If the rightmost digit is inside a red, black, or highlighted box, exclude that digit.\n"
            "6. Output nothing except the digit string — no explanation, no units."
        )

        _MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"]

        response = None
        for model in _MODELS:
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=[
                        types.Part.from_bytes(data=image_data, mime_type=mime_type),
                        _GEMINI_PROMPT,
                    ],
                )
                break
            except Exception as model_exc:
                logger.warning("Gemini model %s failed: %s", model, model_exc)
                continue

        if response is None:
            return "", 0.0, "gemini: all models failed"

        raw = response.text.strip()
        # Take only the integer part — drop anything after a decimal/comma separator
        integer_part = re.split(r"[.,]", raw)[0]
        digits = re.sub(r"[^0-9]", "", integer_part)
        logger.info("Gemini raw=%r  integer_part=%r  digits=%r", raw, integer_part, digits)

        if MIN_DIGITS <= len(digits) <= MAX_DIGITS:
            return digits, 0.97, raw
        logger.warning("Gemini digit count %d out of range [%d,%d]", len(digits), MIN_DIGITS, MAX_DIGITS)
        return "", 0.0, f"gemini raw={raw!r} (digit count out of range)"

    except Exception as exc:
        short = str(exc)[:120]
        logger.error("Gemini Vision error: %s", exc)
        return "", 0.0, f"gemini error: {short}"


# ── Claude Vision fallback (if ANTHROPIC_API_KEY is set) ─────────────────────

def _claude_vision_read(image_path: str, processed_img: np.ndarray | None = None) -> tuple[str, float]:
    """Claude Haiku vision fallback. Requires ANTHROPIC_API_KEY."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return "", 0.0

    try:
        import anthropic
    except ImportError:
        return "", 0.0

    try:
        if processed_img is not None:
            _, buf = cv2.imencode(".jpg", processed_img, [cv2.IMWRITE_JPEG_QUALITY, 95])
            image_data = base64.standard_b64encode(buf.tobytes()).decode("utf-8")
            media_type = "image/jpeg"
        else:
            with open(image_path, "rb") as f:
                image_data = base64.standard_b64encode(f.read()).decode("utf-8")
            ext = Path(image_path).suffix.lower()
            media_type_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                              ".png": "image/png", ".webp": "image/webp"}
            media_type = media_type_map.get(ext, "image/jpeg")

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=64,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64",
                     "media_type": media_type, "data": image_data}},
                    {"type": "text", "text": (
                        "This is a cropped photo of an electricity meter display. "
                        "Read the main kWh consumption number from the LCD or digital display. "
                        "Return ONLY the digit string exactly as shown (e.g. '02353' or '012748'). "
                        "Include ALL digits with leading zeros. "
                        "If the rightmost digit is inside a red or black box, exclude only that digit. "
                        "No kWh, no spaces, no decimal points. Digits only."
                    )},
                ],
            }],
        )

        raw = message.content[0].text.strip()
        integer_part = re.split(r"[.,]", raw)[0]
        digits = re.sub(r"[^0-9]", "", integer_part)
        logger.info("Claude raw=%r  integer_part=%r  digits=%r", raw, integer_part, digits)
        if MIN_DIGITS <= len(digits) <= MAX_DIGITS:
            return digits, 0.97
        return "", 0.0

    except Exception:
        return "", 0.0


# ═════════════════════════════════════════════════════════════════════════════
# SEVEN-SEGMENT DISPLAY CLASSIFIER
# ═════════════════════════════════════════════════════════════════════════════

# Segment regions inside a normalised digit cell (y_start, y_end, x_start, x_end)
# All values are fractions of cell height/width.
_SEG_REGIONS: dict[str, tuple[float, float, float, float]] = {
    "a": (0.00, 0.18, 0.10, 0.90),  # top  horizontal
    "b": (0.04, 0.50, 0.68, 1.00),  # top-right  vertical
    "c": (0.50, 0.96, 0.68, 1.00),  # bot-right  vertical
    "d": (0.82, 1.00, 0.10, 0.90),  # bottom horizontal
    "e": (0.50, 0.96, 0.00, 0.32),  # bot-left   vertical
    "f": (0.04, 0.50, 0.00, 0.32),  # top-left   vertical
    "g": (0.40, 0.60, 0.10, 0.90),  # middle horizontal
}

# Standard seven-segment encodings for digits 0–9
_SEG_TO_DIGIT: dict[frozenset, str] = {
    frozenset("abcdef"):   "0",
    frozenset("bc"):       "1",
    frozenset("abdeg"):    "2",
    frozenset("abcdg"):    "3",
    frozenset("bcfg"):     "4",
    frozenset("acdfg"):    "5",
    frozenset("acdefg"):   "6",
    frozenset("abc"):      "7",
    frozenset("abcdefg"):  "8",
    frozenset("abcdfg"):   "9",
}


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


def _find_display_binary(binary: np.ndarray) -> np.ndarray:
    """
    Locate the LCD display window inside the full binary image using
    connected-component bounding boxes, then return a crop with the
    display FRAME removed.
    """
    h, w = binary.shape

    # If image is already a wide digit strip (user cropped tightly), use it as-is.
    # Applying a fixed-fraction crop on an already-tight crop destroys digits.
    if w / (h + 1) > 2.5:
        return binary, None
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
        return binary[y0:y1, x0:x1], None

    x, y, cw, ch = best_box
    py = max(8, int(ch * 0.07))
    px = max(8, int(cw * 0.04))
    y1c, y2c = max(0, y + py), min(h, y + ch - py)
    x1c, x2c = max(0, x + px), min(w, x + cw - px)

    cropped = binary[y1c:y2c, x1c:x2c]
    if cropped.size == 0:
        y0, y1 = int(h * 0.05), int(h * 0.62)
        x0, x1 = int(w * 0.08), int(w * 0.92)
        return binary[y0:y1, x0:x1], None
    return cropped, best_box


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


# ── Step 4: cell segmentation ─────────────────────────────────────────────────

def _find_cells(band: np.ndarray) -> list[tuple[int, int]]:
    """
    Find the column spans of each digit in the digit band.
    Uses vertical projection; merges small intra-digit gaps;
    splits cells that are suspiciously wide.
    Returns list of (x_start, x_end) sorted left-to-right.
    """
    h, w = band.shape
    col_proj = np.sum(band > 0, axis=0).astype(float)
    mx = col_proj.max()
    if mx < 2:
        return []

    col_s = np.convolve(col_proj, np.ones(3) / 3, mode="same")
    active = col_s > (mx * 0.10)

    pad = np.concatenate([[False], active, [False]])
    chg = np.diff(pad.astype(int))
    starts = np.where(chg == 1)[0].tolist()
    ends   = np.where(chg == -1)[0].tolist()

    if not starts:
        return []

    cells = list(zip(starts, ends))

    avg_w     = float(np.mean([e - s for s, e in cells]))
    min_gap   = max(2, int(avg_w * 0.22))
    merged    = [cells[0]]
    for s, e in cells[1:]:
        gap = s - merged[-1][1]
        if gap <= min_gap:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))

    avg_w2 = float(np.mean([e - s for s, e in merged]))
    dot_thr = avg_w2 * 0.20
    digit_cells = [(s, e) for s, e in merged if (e - s) > dot_thr]

    widths  = sorted([e - s for s, e in digit_cells])
    median_w = widths[len(widths) // 2] if widths else avg_w2
    final = []
    for s, e in digit_cells:
        if (e - s) >= median_w * 1.75 and (e - s) > 10:
            mid = (s + e) // 2
            final.extend([(s, mid), (mid, e)])
        else:
            final.append((s, e))

    return sorted(final)


# ── Step 5: read one digit cell ──────────────────────────────────────────────

def _read_cell(cell: np.ndarray) -> tuple[str, float]:
    """
    Determine the digit in a binarised cell using segment density analysis.
    Returns (digit, confidence).  '?' means unrecognised.
    """
    ch, cw = cell.shape
    if ch < 5 or cw < 3:
        return "?", 0.0

    densities: dict[str, float] = {}
    for seg, (y0f, y1f, x0f, x1f) in _SEG_REGIONS.items():
        y0 = max(0, int(ch * y0f));  y1 = min(ch, max(y0 + 1, int(ch * y1f)))
        x0 = max(0, int(cw * x0f));  x1 = min(cw, max(x0 + 1, int(cw * x1f)))
        region = cell[y0:y1, x0:x1]
        densities[seg] = float(np.sum(region > 0) / region.size) if region.size else 0.0

    max_d = max(densities.values())
    if max_d < 0.07:
        return "?", 0.0

    thr = max_d * 0.50
    lit = frozenset(s for s, d in densities.items() if d >= thr)

    if lit in _SEG_TO_DIGIT:
        return _SEG_TO_DIGIT[lit], 1.0

    best_digit, best_j = "?", 0.0
    for pattern, digit in _SEG_TO_DIGIT.items():
        inter = len(lit & pattern)
        union = len(lit | pattern)
        j = inter / union if union else 0.0
        if j > best_j:
            best_j, best_digit = j, digit

    return (best_digit, best_j) if best_j >= 0.65 else ("?", 0.0)


# ── Step 6: full seven-segment reading ───────────────────────────────────────

def _classify_seven_segment(img: np.ndarray) -> tuple[str, float, str]:
    """
    Run the full seven-segment pipeline on img.
    Returns (reading, confidence, display_type).
    Returns ("", 0.0, display_type) on failure.
    """
    img = _upscale(img, min_w=1400)

    binary_full, disp_type = _binarise_full(img)

    if disp_type == "dark":
        return "", 0.0, "dark"

    binary, disp_box = _find_display_binary(binary_full)

    if disp_box is not None:
        dx, dy, dcw, dch = disp_box
        ih, iw = img.shape[:2]
        disp_orig = img[max(0, dy):min(ih, dy+dch), max(0, dx):min(iw, dx+dcw)]
        if disp_orig.size > 0:
            dg = cv2.cvtColor(disp_orig, cv2.COLOR_BGR2GRAY)
            ddh, ddw = dg.shape
            actual_mean = float(np.mean(dg[ddh//4:3*ddh//4, ddw//4:3*ddw//4]))
            if actual_mean < 90:
                disp_type = "dark"
                return "", 0.0, disp_type

    band, _ = _find_digit_band(binary)
    if band.size == 0:
        return "", 0.0, disp_type

    cells = _find_cells(band)
    if len(cells) < MIN_DIGITS:
        cells = _find_cells(binary)

    if not (MIN_DIGITS <= len(cells) <= MAX_DIGITS):
        return "", 0.0, disp_type

    digits, confs = [], []
    for s, e in cells:
        d, c = _read_cell(band[:, s:e])
        digits.append(d)
        confs.append(c)

    while digits and digits[0] == "?":
        digits.pop(0); confs.pop(0)
    while digits and digits[-1] == "?":
        digits.pop(); confs.pop()

    valid = [(d, c) for d, c in zip(digits, confs) if d != "?"]
    if len(valid) < MIN_DIGITS:
        return "", 0.0, disp_type

    reading = "".join(d for d, _ in valid)
    avg_conf = float(np.mean([c for _, c in valid]))
    return reading, avg_conf, disp_type


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
# MAIN PIPELINE
# ═════════════════════════════════════════════════════════════════════════════

def run_ocr(image_path: str) -> dict:
    raw = _load(image_path)
    img = _strip_watermark(raw)
    img = _upscale(img, min_w=1400)

    # ── Primary: Gemini Vision (free) ─────────────────────────────────────
    gemini_reading, gemini_conf, gemini_raw = _gemini_vision_read(image_path, processed_img=img)
    if gemini_reading and _valid(gemini_reading):
        return {
            "candidate":   gemini_reading,
            "confidence":  round(gemini_conf, 4),
            "method":      "gemini_vision",
            "all_candidates": [{"candidate": gemini_reading, "confidence": round(gemini_conf, 4),
                                 "score": 999, "variant": "gemini_vision"}],
            "raw_text":    gemini_raw,
        }
    gemini_fail_reason = gemini_raw  # carry forward for raw_text if all methods fail

    # ── Fallback: EasyOCR ─────────────────────────────────────────────────
    # Pass the full image — the user's crop is already tight around the digits,
    # so any further fixed-fraction crop would cut off digits.
    eocr_reading, eocr_conf = _easyocr_read(img)

    if eocr_reading and _valid(eocr_reading):
        return {
            "candidate":   eocr_reading,
            "confidence":  round(eocr_conf, 4),
            "method":      "easyocr",
            "all_candidates": [{"candidate": eocr_reading, "confidence": round(eocr_conf, 4),
                                 "score": round(_score_easyocr(eocr_reading, eocr_conf, 0.15), 2),
                                 "variant": "easyocr_fallback"}],
            "raw_text":    f"easyocr_fallback → {eocr_reading}",
        }

    return {
        "candidate": "", "confidence": 0.0, "method": "none",
        "all_candidates": [], "raw_text": f"no reading found ({gemini_fail_reason})",
    }


# ═════════════════════════════════════════════════════════════════════════════
# LCD CORRECTION  (applied after reading regardless of method)
# ═════════════════════════════════════════════════════════════════════════════

def _lcd_correct(digits: str) -> tuple[str, bool, str]:
    """
    Conservative LCD correction for seven-segment / EasyOCR only.
    Only fixes clearly impossible patterns (e.g. "888xx" start where
    three-segment confusion is statistically certain).
    Do NOT apply to vision AI results.
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
def ocr_health_check():
    try:
        reader = _get_reader()
        has_gemini = bool(os.environ.get("GEMINI_API_KEY", ""))
        has_claude = bool(os.environ.get("ANTHROPIC_API_KEY", ""))
        return {
            "message":           "OCR route is active",
            "ocr_engine":        "Gemini Vision (primary) + EasyOCR fallback",
            "gemini_vision":     has_gemini,
            "easyocr_ready":     reader is not None,
            "primary_method":    "gemini_vision" if has_gemini else "easyocr",
            "fallback_method":   "easyocr",
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
async def read_meter_photo(
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
        with saved_path.open("wb") as buf:
            shutil.copyfileobj(file.file, buf)

        result      = run_ocr(str(saved_path))
        raw_reading = result["candidate"]
        confidence  = float(result["confidence"])
        conf_pct    = round(confidence * 100, 2)
        method      = result["method"]

        if not raw_reading:
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
                "image_path":    file.filename or "",
                "all_candidates": [],
                "review_reason": "No valid meter reading candidate was detected.",
            }

        # Vision AI reads digits correctly — no LCD correction needed
        if method in ("gemini_vision", "claude_vision"):
            corrected    = raw_reading
            changed      = False
            corr_reason  = ""
            low_conf     = False
            ambiguous    = False
        else:
            corrected, changed, corr_reason = _lcd_correct(raw_reading)
            low_conf     = confidence < MIN_RELIABLE_CONFIDENCE
            ambiguous    = _ambiguous(raw_reading, confidence)

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
            "image_path":              file.filename or "",
            "all_candidates":          result["all_candidates"],
            "review_reason":           " ".join(reasons),
            "minimum_reliable_confidence": MIN_RELIABLE_CONFIDENCE,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"OCR processing failed: {exc}")
    finally:
        saved_path.unlink(missing_ok=True)
