"""Synthetic seven-segment LCD digit rows, styled after real electricity meters.

The trained models learned from Roboflow photos of one meter style and read the
campus meters (Aclara I-210+, Vision) 0% correctly. These renders teach the shapes
those displays share: seven-segment digits of varying thickness, slant and spacing,
leading zeros or blank leading cells, faint unlit "ghost" segments, the "kWh" label,
a smaller second row below, small annunciators, the LCD frame and meter face where
the pipeline's widened crop shows them, glare and blur.

render() returns (grayscale uint8 image, label). The label is the digits that are
lit, leading zeros included, exactly as a person reads the display.
"""
import random

import cv2
import numpy as np

SEGMENTS = {
    "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
    "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg",
}
# Real meters disagree on a few glyphs: 6 with or without its top bar, 7 with or
# without a left tail, 9 with or without its bottom bar.
VARIANTS = {"6": ["afgedc", "fgedc"], "7": ["abc", "fabc"], "9": ["abcdfg", "abcfg"]}


def _segment_polys(w, h, t, gap, hexagonal):
    """Polygons for segments a..g of one digit cell (origin top-left)."""
    left, right, top, mid, bottom = t / 2, w - t / 2, t / 2, h / 2, h - t / 2
    half = t / 2

    def horiz(y, x0, x1):
        if hexagonal:
            return [(x0, y), (x0 + half, y - half), (x1 - half, y - half), (x1, y),
                    (x1 - half, y + half), (x0 + half, y + half)]
        return [(x0, y - half), (x1, y - half), (x1, y + half), (x0, y + half)]

    def vert(x, y0, y1):
        if hexagonal:
            return [(x, y0), (x + half, y0 + half), (x + half, y1 - half), (x, y1),
                    (x - half, y1 - half), (x - half, y0 + half)]
        return [(x - half, y0), (x + half, y0), (x + half, y1), (x - half, y1)]

    return {
        "a": horiz(top, left + gap, right - gap),
        "b": vert(right, top + gap, mid - gap),
        "c": vert(right, mid + gap, bottom - gap),
        "d": horiz(bottom, left + gap, right - gap),
        "e": vert(left, mid + gap, bottom - gap),
        "f": vert(left, top + gap, mid - gap),
        "g": horiz(mid, left + gap, right - gap),
    }


def _random_reading():
    """(reading, blank leading cells). Mostly 5-7 digits, like real meters."""
    n = random.choices([4, 5, 6, 7, 8], weights=[1, 5, 4, 3, 1])[0]
    value = random.randint(0, 10 ** n - 1)
    style = random.random()
    if style < 0.55:
        return str(value).zfill(n), 0           # leading zeros shown (Aclara 00653)
    text = str(value)
    if style < 0.8:
        return text, n - len(text)              # blank leading cells (Vision 11847)
    return text, 0                              # no spare cells at all


def _fill(mask, pts):
    cv2.fillPoly(mask, [np.round(pts * 4).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=2)


def render():
    reading, blank_cells = _random_reading()
    h = random.uniform(56, 96)                  # digit height in px
    w = h * random.uniform(0.42, 0.62)
    t = w * random.uniform(0.10, 0.22)          # segment thickness
    gap = t * random.uniform(0.05, 0.5)
    spacing = w * random.uniform(0.22, 0.65)
    slant = np.tan(np.radians(random.uniform(0, 11)))
    hexagonal = random.random() < 0.6
    glyph = {d: random.choice(VARIANTS.get(d, [SEGMENTS[d]])) for d in SEGMENTS}

    # Some displays have unused cells after the reading too (the campus Vision meter
    # shows one), which the models must not read as digits.
    trailing = random.choice([0, 0, 0, 1, 2])
    cells = [None] * blank_cells + list(reading) + [None] * trailing
    pad_l = w * random.uniform(0.3, 1.4)
    pad_r = w * random.uniform(0.3, 2.2)        # room for "kWh" on the right
    pad_t = h * random.uniform(0.15, 0.5)
    pad_b = h * random.uniform(0.15, 0.7)       # room for a partial second row
    W = int(pad_l + len(cells) * w + (len(cells) - 1) * spacing + pad_r + h * slant)
    H = int(pad_t + h + pad_b)

    # LCD background: light, unevenly lit.
    bg = random.uniform(125, 228)
    ink = random.uniform(8, max(10, bg - 70))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    gradient = (1 + random.uniform(-0.18, 0.18) * (xx / W - 0.5)
                + random.uniform(-0.15, 0.15) * (yy / H - 0.5))
    img = np.clip(bg * gradient, 0, 255)

    mask_lit = np.zeros((H, W), np.uint8)
    mask_ghost = np.zeros((H, W), np.uint8)
    # Unlit segments often show faintly. On the Vision meter the unlit top bar
    # above a "1" made it read as "7", so ghosts are sometimes fairly strong.
    ghost_all = random.random() < 0.4
    ghost_blank = ghost_all or random.random() < 0.4    # ghosts in unused cells only
    for i, ch in enumerate(cells):
        x0 = pad_l + i * (w + spacing)
        polys = _segment_polys(w, h, t, gap, hexagonal)
        lit = set(glyph[ch]) if ch is not None else set()
        for name, poly in polys.items():
            pts = np.array([(x0 + px + (h - py) * slant, pad_t + py) for px, py in poly], np.float32)
            if name in lit:
                _fill(mask_lit, pts)
            elif ghost_all or (ch is None and ghost_blank):
                _fill(mask_ghost, pts)
        if random.random() < 0.12 and i < len(cells) - 1:    # decimal point, not in the label
            cx, cy = int(x0 + w + spacing / 2), int(pad_t + h - t / 2)
            cv2.circle(mask_lit, (cx, cy), max(1, int(t * 0.45)), 255, -1)

    if random.random() < 0.45:                  # "kWh" label to the right
        scale = h / random.uniform(70, 120)
        x = int(pad_l + len(cells) * (w + spacing) + random.uniform(0, w * 0.4))
        y = int(pad_t + h * random.uniform(0.7, 1.15))
        cv2.putText(mask_lit, random.choice(["kWh", "kWh", "KWH", "kW"]), (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, 255, max(1, int(scale * 2)), cv2.LINE_AA)

    right_digits = pad_l + len(cells) * w + (len(cells) - 1) * spacing + h * slant
    if random.random() < 0.3:                   # small annunciators: arrows, "Del", tariff marks
        s = h * random.uniform(0.12, 0.28)
        if W - right_digits > s * 1.5:          # in the margin right of the digits
            x, y = random.uniform(right_digits + s * 0.2, W - s), random.uniform(pad_t, pad_t + h - s)
        else:                                   # or in a top corner
            x, y = random.uniform(0, W - s), random.uniform(0, max(1.0, pad_t - s))
        if random.random() < 0.5:
            tri = random.choice([[(0, 0), (s, s / 2), (0, s)], [(0, 0), (s, 0), (s / 2, s)],
                                 [(0, s), (s, s), (s / 2, 0)]])
            _fill(mask_lit, np.array([(x + px, y + py) for px, py in tri], np.float32))
        else:
            scale = s / 22
            cv2.putText(mask_lit, random.choice(["Del", "Rec", "T1", "T2", "Rcvd", "kW", "Ph"]),
                        (int(x), int(y + s)), cv2.FONT_HERSHEY_SIMPLEX, scale, 255,
                        max(1, int(scale * 2)), cv2.LINE_AA)

    if random.random() < 0.3 and pad_b > h * 0.3:   # top of a smaller second row
        small_h = h * random.uniform(0.35, 0.5)
        sw, st = small_h * 0.5, small_h * 0.5 * 0.16
        y_top = pad_t + h + h * random.uniform(0.12, 0.3)
        for i in range(random.randint(2, 5)):
            x0 = W * random.uniform(0.2, 0.5) + i * sw * 1.4
            polys = _segment_polys(sw, small_h, st, st * 0.2, hexagonal)
            for name in random.choice(list(SEGMENTS.values())):
                _fill(mask_lit, np.array([(x0 + px, y_top + py) for px, py in polys[name]], np.float32))

    # Ghosts stay clearly lighter than lit segments: at most 45% of the contrast.
    ghost_depth = random.uniform(4, max(5, 0.45 * (bg - ink)))
    img = img - (mask_ghost.astype(np.float32) / 255) * ghost_depth
    alpha = mask_lit.astype(np.float32) / 255
    img = img * (1 - alpha) + ink * alpha

    # The pipeline widens EasyOCR's text box (routes/ocr.py _dtrb_crop_around), so its
    # crops usually show the LCD window's dark frame inside the image, often close to
    # the digits, with meter face beyond it. Read as digits, the left frame became a
    # leading "1" on the campus Aclara and the top shadow turned the Vision's first
    # "1" into a "7". Drawn here at those positions, sometimes soft like a shadow.
    if random.random() < 0.7:
        frame = np.zeros((H, W), np.float32)
        face = np.zeros((H, W), np.float32)
        room = {"t": pad_t, "b": pad_b, "l": pad_l, "r": W - right_digits}
        for side in random.sample(["t", "b", "l", "r"], random.randint(1, 4)):
            gap = random.uniform(min(0.04 * h, room[side]), room[side])  # digits to frame
            inner = room[side] - gap                                     # frame to border
            outer = inner - h * random.uniform(0.04, 0.2)                # frame thickness
            a, b = max(0, int(round(outer))), int(round(inner))
            if b <= a:
                continue                        # frame falls outside this crop
            if side == "t": frame[a:b] = 1; face[:a] = 1
            if side == "b": frame[H - b:H - a] = 1; face[H - a:] = 1
            if side == "l": frame[:, a:b] = 1; face[:, :a] = 1
            if side == "r": frame[:, W - b:W - a] = 1; face[:, W - a:] = 1
        soft = random.choice([0, 0, h * random.uniform(0.01, 0.08)])
        if soft > 0.5:
            frame = cv2.GaussianBlur(frame, (0, 0), soft)
            face = cv2.GaussianBlur(face, (0, 0), soft)
        face_val = random.choice([random.uniform(150, 245), random.uniform(45, 140)])
        img = img * (1 - face) + face_val * face
        img = img * (1 - frame) + random.uniform(15, 100) * frame

    if random.random() < 0.4:                   # glare
        cx, cy = random.uniform(0, W), random.uniform(0, H)
        sx, sy = random.uniform(W * 0.1, W * 0.5), random.uniform(H * 0.2, H)
        img = img + np.exp(-(((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2)) * random.uniform(15, 80)

    return augment(np.clip(img, 0, 255).astype(np.uint8)), reading


def augment(img):
    """Photo damage shared by synthetic and real crops."""
    H, W = img.shape[:2]
    if random.random() < 0.7:                   # small perspective / rotation
        d = min(H, W) * random.uniform(0.0, 0.12)
        src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
        dst = src + np.float32([[random.uniform(-d, d), random.uniform(-d, d)] for _ in range(4)])
        img = cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (W, H),
                                  borderMode=cv2.BORDER_REPLICATE)
    if random.random() < 0.5:
        k = random.choice([3, 5, 7])
        img = cv2.GaussianBlur(img, (k, k), 0)
    if random.random() < 0.2:                   # motion blur
        k = random.choice([3, 5, 7])
        kernel = np.zeros((k, k), np.float32)
        kernel[k // 2] = 1 / k
        img = cv2.filter2D(img, -1, kernel)
    if random.random() < 0.5:                   # low resolution
        s = random.uniform(0.3, 0.8)
        img = cv2.resize(cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), (W, H))
    img = img.astype(np.float32)
    if random.random() < 0.6:
        img = img + np.random.normal(0, random.uniform(2, 12), img.shape)
    img = np.clip(img * random.uniform(0.7, 1.25) + random.uniform(-30, 30), 0, 255).astype(np.uint8)
    if random.random() < 0.6:
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, random.randint(25, 90)])
        img = cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    return img


def jitter_crop(img, pad_frac=0.15):
    """Re-pad or trim a real crop's edges so the models don't rely on exact framing."""
    H, W = img.shape[:2]

    def r(n):
        return int(n * random.uniform(-pad_frac, pad_frac))

    top, bottom, left, right = r(H), r(H), r(W) // 3, r(W) // 3
    img = cv2.copyMakeBorder(img, max(0, top), max(0, bottom), max(0, left), max(0, right),
                             cv2.BORDER_REPLICATE)
    H2, W2 = img.shape[:2]
    return img[max(0, -top):H2 - max(0, -bottom) or H2, max(0, -left):W2 - max(0, -right) or W2]
