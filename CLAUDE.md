# EnerSight — notes for Claude

Capstone project: campus building energy monitoring with meter-photo OCR, EUI status
grading, a GIS map, analytics, forecasts and printable reports. Setup and run steps are
in [README.md](README.md) (PostgreSQL, backend venv + `.env`, `seed_demo_data.py`, OCR
weights, frontend).

## Working with this user

- They write in Cebuano (Bisaya). Reply in English.
- Once they approve a multi-step plan, finish it in one pass. Stop only for steps that
  publish something (push, deploy) or destroy data (reseeding or deleting readings).
- Current work lives on the `capstone-updates` branch. Don't push to or merge into
  `main` without asking.
- When checking a panel/defense feedback list against the code, check only the
  system/feature items and skip manuscript/documentation items.

## Layout

- `enersight-backend/`: FastAPI + SQLAlchemy + PostgreSQL. Tables are created by
  `Base.metadata.create_all`. The JWT secret must come from `.env` (`JWT_SECRET_KEY`).
- `enersight-frontend/`: React 19, Vite, Tailwind v4, Recharts, react-leaflet. The API
  base is `http://<page hostname>:8000` (`src/config.js`).
- Dashboard, Analytics and Reports compute their figures in the browser from
  `/buildings/`, `/meters/`, `/readings/` and `/appliances/`. The old backend analytics
  and reports routes were removed.

## Before committing frontend changes

```
cd enersight-frontend
npm test        # Vitest, src/utils/*.test.js
npm run lint
npm run build
```

Known lint false positives, don't "fix" pages for them: `'Icon' is defined but never
used` where `icon: Icon` is destructured, and `react-hooks/set-state-in-effect` in
LocationPickerModal and UploadOCR.

## Domain rules

- **EUI status** (kWh/m²/yr): High > 10, Critical > 20. Intensity is annualised over the
  days the readings cover: each reading's `covers_from` is the same meter's previous
  reading date (`annotateReadingCoverage`, call it before any period filter). Spans under
  `MIN_DAYS_TO_ANNUALIZE` (20 days) are not annualised. Lives in
  `src/utils/energyStatus.js` and is mirrored in `enersight-backend/app/routes/map.py`;
  `energyStatus.test.js` reads map.py and fails if the two drift, so change both.
- **Reading quality:** `ocr_accuracy` null or ≤ 0 is a manual entry, never "0% OCR".
  Always go through `src/utils/readingQuality.js` (low-accuracy threshold 90%).
- **Two consumption sources, never mixed:** measured = `reading_value − previous_reading`
  from meter readings; estimated = appliances, `watts × quantity × hours/day × days/month
  ÷ 1000`. Cost = kWh × one global rate (`settings` table `rate_per_kwh`, default ₱12;
  backend `get_rate_per_kwh`, frontend `useElectricityRate`).
- **Periods:** `src/utils/periods.js` (This/Last Month, This Year, Custom Range and the
  comparison window), shared by Analytics and Reports.
- **Forecast:** `buildForecastModel` in `src/utils/forecast.js` back-tests moving
  average, linear trend and same-month-last-year (needs 12 months) and leads with the
  lowest error. `components/ForecastChart.jsx` draws it on Dashboard and Analytics.
  Shared constants stay in `utils/` because a .jsx that exports constants fails the
  react-refresh lint rule.

## OCR

- EasyOCR is the anchor. The three trained DTRB models override it only when 2 of them
  agree (`_MIN_TRAINED_VOTES_TO_OVERRIDE` in `routes/ocr.py`). Don't switch to a
  weighted vote: one confident model once turned a correct `087654` into `1209`.
- The `.pth` weights are not in git (the user's Google Drive; `install_ocr_weights.ps1`).
  Without them OCR runs on EasyOCR alone, which is expected. `GET /ocr/health` lists
  which models loaded.
- Don't add Gemini, Claude Vision or any external vision API. The capstone paper only
  covers EasyOCR plus the trained models.
- The trained models truncate long readings and are confidently wrong on real photos.
  The fix is training data (7-digit readings, photos of the real campus meters), not
  architecture. Most public Roboflow meter datasets proved unusable (rotated images, gas
  meters, short labels).

## UI conventions

- One `components/PageHeader.jsx` and one `components/StatCard.jsx`. Use `EmptyState`
  (variants `empty`, `filtered`, `blocked`) and `SkeletonRows`. Each table keeps a
  `*_ROW_COLUMNS` grid-template string that mirrors its `grid-cols-[...]` class; update
  both together.
- Plus Jakarta Sans; weights 400/500/600/700 (no `font-black`); radii `rounded-2xl`,
  `rounded-xl`, `rounded-full`; shadows `shadow-sm`, `shadow-md`, `shadow-xl`.
- The GIS map uses OSM tiles muted by the `.energy-street-tiles` CSS filter. Don't switch
  to CARTO or Stadia: without an API key they stamp "API KEY REQUIRED" over the tiles.
  Pin `iconAnchor [18, 39]` must match the `.energy-pin` CSS.

## Gotchas

- The .jsx sources use CRLF. Scripts that search for `\n` patterns silently miss; split
  on `/\r?\n/`.
- PowerShell `Get-Content`/`Set-Content` mangles UTF-8 (`·`, `²`, `₱`). Use
  `[System.IO.File]::ReadAllText` / `WriteAllText`.
- `seed_demo_data.py` defaults the Admin password to `EnerSight2026!`. The user chose to
  keep that default (Sep 2026). The script only creates an Admin when none exists.
