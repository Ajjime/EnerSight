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
- **No review step (user's choice, Nov 2026):** `POST /readings/` saves every new
  reading as verified; there is no "needs review" queue on Add Meter Reading. The
  safety net is the warning before saving: the amber "Check the number" note when
  the scan set `needs_review`, the plausibility notes, and the "save anyway?"
  prompt. Keep those. `is_verified` is still never taken from the client, and an
  Admin or Manager can send a reading back with `PUT /readings/{id}/review`. (An
  OCR-proof variant, approving only readings OCR confirmed, was built and dropped
  the same day: the user wanted no review UI at all.)
- **Two consumption sources, never mixed:** measured = `reading_value − previous_reading`
  from meter readings; estimated = appliances, `watts × quantity × hours/day × days/month
  ÷ 1000`. Cost = kWh × one global rate (`settings` table `rate_per_kwh`, default ₱12;
  backend `get_rate_per_kwh`, frontend `useElectricityRate`).
- **Expected EUI (appliances on the EUI scale):** `getApplianceEui` in
  `utils/buildingProfile.js` = appliance kWh/month × 12 ÷ floor area, graded on the
  same bands (`getApplianceStatus`); each appliance gets its share in kWh/m²/yr. It is
  shown beside the measured EUI (Building Profile Appliances tab, Analytics chips) and
  never becomes or changes a building's status: the meter already counts the
  appliances, so adding the two double-counts. The EUI formula and bands stay as is.
- **Periods:** `src/utils/periods.js` (This/Last Month, This Year, Custom Range and the
  comparison window), shared by Analytics and Reports.
- **Meter rounds:** Add Meter Reading lists meters as "to read" or "done" for the chosen
  calendar month (done = at least one reading dated in it), never-read meters first,
  then longest unread. "Save and next meter" moves to the next one still to read.
  Frontend only, from `/readings/`; logic in `src/utils/meterRounds.js` (tested).
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
  turned a correct `087654` into `1209`. Don't raise the 2 to 3 either: tested, it
  blocked two models reading the second Vision meter's `20959` right.
- When no trained model read EasyOCR's number, and all three trained models are within
  one digit of their consensus (`_trained_consensus`), the consensus wins, as a
  reviewed override, unless it is a shortened copy of EasyOCR's reading. EasyOCR was
  wrong every time it stood alone in testing; this turned `24454` into the right
  `20959` and, with the round-2 weights, `0847` into `11847`. It was briefly limited
  to EasyOCR's length because the round-1 weights agreed on `718477` for `11847`;
  don't restore that with round-2 weights (it blocked right answers).
- A reading no trained model agrees with (by value) goes to review
  (`uncorroborated`). On every test photo that separated right from wrong; EasyOCR
  was up to 97% confident on the wrong ones.
- Below `MIN_USABLE_CONFIDENCE` (30%) the scan returns no reading; a lecture-slide
  photo used to come back as `4174337` at 4%.
- The user scans the whole photo, always: no crop step on the upload page (they asked
  twice; a crop step was removed Oct 30 2026). The page scans as soon as a photo is
  picked and only scales photos over 2048 px down (`utils/photoResize.js`).
- Whole photos (long side ≥ 1600 px) go through `_display_area` first: a quick pass at
  1024 px finds the tallest digit text (the reading; serials and labels are much
  shorter) and the pipeline reads a loose area around it. Without it EasyOCR picked a
  barcode number or a neighbouring meter's serial, and a whole photo took 18 s warm
  (53 s cold) instead of about 10. Capping the detector size instead was faster but
  changed which text won. A tight area hurts: around just the digits the Aclara
  `00653` read as `8865`. Don't tune EasyOCR's preprocessing on the handful of real
  photos; its results flip on small changes (`00653` ↔ `88653`).
- `warm_up()` loads and runs every model in a background thread at startup
  (`OCR_PRELOAD=0` skips it), so the first scan after a restart is not the slow one.
- `run_at_full_speed()` (inference.py, called by routes/ocr.py and train.py) opts the
  process out of Windows 11 efficiency mode. A server in a minimized window was
  throttled to the slow cores: 30-34 s per whole photo instead of about 10. It only
  changes speed. Smaller detector sizes (display search at 768 px, main detection at
  0.8x) were 20-30% faster but reshuffled the Vision meter's results, so they were
  not adopted; ONNX Runtime was identical but only ~10% faster.
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
  - Round 2 (Oct 30 2026) continued from round 1 with bezel shadows and Benford first
    digits in `synth.py` plus one photo of the second Vision meter; round-1 weights
    are kept as `finetuned_round1.pth`. Whole-pipeline test: 12 of 14 right (was 10).
    The campus photos have guided every decision, so treat that as optimistic.
  - Both Vision meters read right through the trained models (EasyOCR misreads them:
    the top shadow over a "1" and glare). The first one (`11847`) still fails on some
    crops (`184`, `71847`); review flags and plausibility checks catch those.
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
- **Less text (user's request, Nov 2026: too many words were confusing).** `PageHeader`
  is icon, title, "Updated" time and buttons only: no label above the title, no
  subtitle, no count badges. Show a number in one place per page. Put explanations
  behind an `InfoHint` (`utils/glossary.js`), not in paragraphs or footnotes. Error
  toasts use `utils/messages.js` (`SERVER_UNREACHABLE`, `describeError`), never
  "make sure FastAPI is running". An unverified reading is labelled "Needs Review"
  everywhere. The Analytics method-comparison table stays open (Objective 2).
- Sample data (Load / Remove) is an Admin-only panel in Settings
  (`components/SampleDataPanel.jsx`), not buttons on Buildings and Meters. Its list,
  `utils/sampleData.js`, mirrors `DEMO_BUILDINGS` in `seed_demo_data.py`;
  `sampleData.test.js` reads that file and fails if they drift.
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
