import cv2, numpy as np

def upscale(img, mw=1400):
    h, w = img.shape[:2]
    if w < mw:
        s = mw / w
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    return img

def has_blue(img):
    h = img.shape[0]
    top = img[:max(1, int(h * 0.12)), :]
    hsv = cv2.cvtColor(top, cv2.COLOR_BGR2HSV)
    blue = cv2.inRange(hsv, (95, 80, 80), (135, 255, 255))
    return float(np.mean(blue > 0)) > 0.003

def strip(img):
    if has_blue(img):
        h = img.shape[0]
        return img[int(h * 0.09):, :]
    return img

def find_display(img):
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 30, 120)
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dil = cv2.dilate(edges, k, iterations=2)
    cnts, _ = cv2.findContours(dil, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    best_s, best_b = 0.0, None
    for cnt in cnts:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.025 * peri, True)
        if len(approx) not in range(4, 8):
            continue
        x, y, cw, ch = cv2.boundingRect(cnt)
        area = cw * ch
        if area < w * h * 0.025 or area > w * h * 0.78:
            continue
        asp = cw / (ch + 1e-6)
        if asp < 1.4 or asp > 11:
            continue
        cy_n = (y + ch / 2) / h
        pos = max(0.0, 1.0 - abs(cy_n - 0.42) * 2.5)
        sc = (area / (w * h)) * (2.0 if 2 <= asp <= 7 else 1.0) * (1 + pos)
        if sc > best_s:
            best_s, best_b = sc, (x, y, cw, ch)

    if best_b is None:
        y0, y1 = int(h * 0.04), int(h * 0.62)
        x0, x1 = int(w * 0.07), int(w * 0.93)
        print(f"  display: FALLBACK crop {x1-x0}x{y1-y0}")
        return img[y0:y1, x0:x1]

    x, y, cw, ch = best_b
    px, py = max(5, int(cw * 0.03)), max(5, int(ch * 0.12))
    asp = round(cw / (ch + 1e-6), 1)
    print(f"  display: rect found score={round(best_s,3)} asp={asp} size={cw}x{ch}")
    return img[max(0, y-py):min(h, y+ch+py), max(0, x-px):min(w, x+cw+px)]


for fname, gt in [
    ("photo_meter (1).jpg",  "022252"),
    ("photo_meter (5).jpg",  "14426"),
    ("photo_meter (10).jpg", "02353"),
    ("photo_meter (11).jpg", "000027"),
    ("photo_meter (6).jpg",  "493452"),
]:
    path = rf"C:\Users\Admin\Downloads\photometers\train\{fname}"
    img = cv2.imread(path)
    print(f"\n=== {fname} (gt={gt}) ===")
    print(f"  orig: {img.shape[1]}x{img.shape[0]}")

    img = strip(img)
    img = upscale(img)
    print(f"  after strip+upscale: {img.shape[1]}x{img.shape[0]}")

    display = find_display(img)
    print(f"  display: {display.shape[1]}x{display.shape[0]}")

    gray = cv2.cvtColor(display, cv2.COLOR_BGR2GRAY)
    ce = cv2.createCLAHE(3.0, (8, 8)).apply(gray)
    dh, dw = ce.shape
    centre = ce[dh//3:2*dh//3, dw//4:3*dw//4]
    mean_v = float(np.mean(centre))
    dtype = "light" if mean_v >= 95 else "dark"
    print(f"  centre mean={round(mean_v,1)}  type={dtype}")

    blur = cv2.GaussianBlur(ce, (3, 3), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    binary = cv2.bitwise_not(otsu) if mean_v >= 95 else otsu
    cv2.imwrite(rf"C:\Users\Admin\Downloads\photometers\dbg_{fname}", binary)

    # digit band
    h, w = binary.shape
    n, _, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    min_h = h * 0.35
    tall = []
    for i in range(1, n):
        ch2 = stats[i, cv2.CC_STAT_HEIGHT]
        cw2 = stats[i, cv2.CC_STAT_WIDTH]
        if ch2 >= min_h and cw2 >= 4:
            cy0 = stats[i, cv2.CC_STAT_TOP]
            tall.append((cy0, cy0 + ch2, cw2, ch2))

    print(f"  tall components (h>={round(min_h)}): {len(tall)}")
    for t in tall[:6]:
        print(f"    y={t[0]}-{t[1]}  w={t[2]}  h={t[3]}")

    if tall:
        y0s = [t[0] for t in tall]
        y1s = [t[1] for t in tall]
        ym = max(0, min(y0s) - int(h * 0.06))
        yx = min(h, max(y1s) + int(h * 0.06))
        band = binary[ym:yx, :]
        cp = np.sum(band > 0, axis=0)
        mx = float(cp.max())
        active = cp > (mx * 0.10)
        print(f"  band y={ym}-{yx}  col_proj max={round(mx)}  active_cols={int(np.sum(active))}/{w}")
