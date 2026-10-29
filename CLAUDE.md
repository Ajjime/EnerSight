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
  `Base.metadata.create_all`, which never alters an existing table: a column added to
  an existing model must also go in `_ADDED_COLUMNS` in `app/main.py` (additive
  `ALTER TABLE` on startup). The JWT secret must come from `.env` (`JWT_SECRET_KEY`).
- `enersight-frontend/`: React 19, Vite, Tailwind v4, Recharts, react-leaflet. The API
  base is `http://<page hostname>:8000` (`src/config.js`).
- Dashboard, Analytics and Reports compute their figures in the browser from
  `/buildings/`, `/meters/`, `/readings/` and `/appliances/`. The old backend analytics
  and reports routes were removed.
- Clicking a building (Buildings rows, GIS map "Full profile", Dashboard EUI ranking and
  map pins, Analytics table) opens `components/BuildingProfile.jsx`, lazy-loaded per
  page. Its figures come from `utils/buildingProfile.js` (tested), using the same rules.

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

- **EUI status** (kWh/m²/yr): High > 150, Critical > 250. Intensity is annualised over the
  days the readings cover: each reading's `covers_from` is the same meter's previous
  reading date (`annotateReadingCoverage`, call it before any period filter). Spans under
  `MIN_DAYS_TO_ANNUALIZE` (20 days) are not annualised. Lives in
  `src/utils/energyStatus.js` and is mirrored in `enersight-backend/app/routes/map.py`;
  `energyStatus.test.js` reads map.py and fails if the two drift, so change both.
- **Reading quality:** `ocr_accuracy` null or ≤ 0 is a manual entry, never "0% OCR".
  Always go through `src/utils/readingQuality.js` (low-accuracy threshold 90%).
- **Reading plausibility:** `src/utils/readingPlausibility.js` checks a new reading
  against its meter's history: lower than the last reading (blocks save), more than
  `JUMP_FACTOR` (3×) the meter's usual kWh/day, or part of its serial number. The last
  two ask "save anyway?". This, not OCR confidence, is what catches misreads: the
  campus Vision meter read 11847 as 1847 at 76%.
- **Two consumption sources, never mixed:** measured = `reading_value − previous_reading`
  from meter readings; estimated = appliances, `watts × quantity × hours/day × days/month
  ÷ 1000`. Cost = kWh × one global rate (`settings` table `rate_per_kwh`, default ₱12;
  backend `get_rate_per_kwh`, frontend `useElectricityRate`).
- **Periods:** `src/utils/periods.js` (This/Last Month, This Year, Custom Range and the
  comparison window), shared by Analytics and Reports.
- **Forecast:** `buildForecastModel` in `src/utils/forecast.js` back-tests moving
  average, weighted moving average and simple exponential smoothing (α 0.3) on a 70/30
  split, ranks by MAPE and reports MAE/RMSE/MAPE/R². These three are Table 4 of the
  manuscript, which is frozen — keep them in step. All three are level-only, so every
  forecast month is identical; expected, not a bug. The direction badge compares against
  a 6-month baseline (at 3 months the moving average compared with itself and read
  "Steady" forever). `components/ForecastChart.jsx` draws the leading method only on the
  Dashboard and all three on Analytics.
  Shared constants stay in `utils/` because a .jsx that exports constants fails the
  react-refresh lint rule.

## OCR

- EasyOCR is the anchor. The three trained DTRB models override it only when at least 2
  of them agree (`_MIN_TRAINED_VOTES_TO_OVERRIDE` in `routes/ocr.py`), outnumber
  EasyOCR's side (EasyOCR plus any trained model that agrees with it), and their reading
  is not a shortened copy of EasyOCR's. An override is always sent for review
  (`overrode_easyocr`). Don't switch to a weighted vote: one confident model once
  turned a correct `087654` into `1209`.
- Below `MIN_USABLE_CONFIDENCE` (30%) the scan returns no reading; a lecture-slide
  photo used to come back as `4174337` at 4%.
- The upload page crops before scanning (`react-image-crop`, `utils/imageCrop.js`). The
  box should be loose: the display plus some meter face. A tight box around just the
  digits read the campus Aclara `00653` as `8865`; a loose one read it right in 8–12 s
  instead of 64 s for the full photo. Don't tune EasyOCR's preprocessing on the handful
  of real photos; its results flip on small changes (`00653` ↔ `88653`).
- Each saved reading keeps `ocr_reading` (what OCR read, leading zeros kept) next to
  `reading_value` (what was saved). `export_ocr_dataset.py` exports photo + label pairs
  in the `eval_data/labels.csv` format, for evaluation or retraining. Eval labels must
  come from the display, never from OCR output.
- The `.pth` weights are not in git (the user's Google Drive; `install_ocr_weights.ps1`).
  Without them OCR runs on EasyOCR alone, which is expected. `GET /ocr/health` lists
  which models loaded.
- Don't add Gemini, Claude Vision or any external vision API. The capstone paper only
  covers EasyOCR plus the trained models.
- The original trained models (Colab, Roboflow photos of one meter style) read the
  campus meters 0% correctly. Two causes, both addressed:
  - They read `_dtrb_crop_around`: the text box EasyOCR's detector found, widened. The
    old binary localiser (`_prepare_dtrb_crop`, now only a fallback) handed them two
    LCD rows, meter body, or cut-off digits.
  - `enersight-backend/ocr_training/` fine-tunes them from the original weights on
    synthetic seven-segment displays plus the original crops; same architectures.
    Results in `ocr_training/results.md`. The renderer draws the LCD frame and meter
    face where the widened crop shows them; without that the models read the frame
    as a leading "1" (`100653`).
  - Each model's checkpoint is the best on the Roboflow validation split. Don't
    re-pick checkpoints by their campus scores: those flip between checkpoints and
    are the sets we report on.
  - Still unsolved: the campus Vision `11847`. Every engine misreads it (`1847`,
    `7847`, `71847`: the top shadow plus the first "1" looks like a "7"). The
    plausibility checks are what catch it.
- The backend loads `weights/<model>/finetuned.pth` when present, else the original
  `best_accuracy.pth`; `/ocr/health` → `dtrb_weight_files` says which. Training and the
  app share `inference.read_crop`, so evaluation scores what the system reads.
- The real fix is still photos of the campus meters: once readings saved through the
  app accumulate, export them and add them to training. Most public Roboflow meter
  datasets proved unusable (rotated images, gas meters, short labels).

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

- **Line endings under `src/` are mixed, not uniformly CRLF.** Only 8 of the 47 files
  are CRLF (`config.js`, `Dashboard.jsx`, `ProfilePage.jsx`, `auth/SignIn.jsx`,
  `HeaderActionButton.jsx`, `ToastMessage.jsx`, `ui/AuthShell.jsx`,
  `hooks/useAutoRefresh.js`); the other 39, including `utils/forecast.js`,
  `Analytics.jsx` and `BuildingMap.jsx`, are LF. An edit script that assumes either
  one silently matches nothing. Detect per file before splitting, and split on
  `/\r?\n/` in JS.
- PowerShell `Get-Content`/`Set-Content` mangles UTF-8 (`·`, `²`, `₱`). Use
  `[System.IO.File]::ReadAllText` / `WriteAllText`.
- `seed_demo_data.py` defaults the Admin password to `EnerSight2026!`. The user chose to
  keep that default (Sep 2026). The script only creates an Admin when none exists.
- `seed_demo_data.py --demo` is the full test dataset (deletes readings first). Each demo
  building has its own EUI target and `measured_vs_listed` appliance ratio, chosen so
  every period grades 2 Critical, 2 High, 2 Normal, 1 No Data and Analytics shows all
  four appliance verdicts. Retune both if the thresholds or the 15% gap tolerance change.
  `--demo` only adds appliances to demo buildings; the user's own buildings are left alone.
