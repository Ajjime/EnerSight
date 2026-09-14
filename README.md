# EnerSight

Building-specific energy consumption mapping and optimization using GIS.

Users photograph an electric meter, an OCR ensemble reads the digits, and the
reading is stored against a meter belonging to a building. The system then maps,
charts, costs, and forecasts that consumption, and flags buildings whose energy-use
intensity is out of line.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy, PostgreSQL |
| OCR | EasyOCR plus three trained DTRB models (PyTorch), reconciled by a weighted ensemble |
| Frontend | React 19, Vite, Tailwind CSS |
| Mapping | Leaflet with OpenStreetMap tiles |
| Charts | Recharts |

---

## Setup

### 1. Database

Create an empty PostgreSQL database:

```sql
CREATE DATABASE energy_gis_db;
```

Tables are created automatically on first backend start.

### 2. Backend

```bash
cd enersight-backend
python -m venv venv
venv\Scripts\activate            # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

copy .env.example .env           # macOS/Linux: cp .env.example .env
```

Then edit `.env`:

- `DATABASE_URL` — your PostgreSQL connection string.
- `JWT_SECRET_KEY` — **required, the backend refuses to start without it.** Generate one:
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```

Start it:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API docs: <http://localhost:8000/docs>

### 3. Create the first admin and some data

A fresh database has no accounts, and sign-up cannot create an Admin. Use the seed
script:

```bash
python seed_demo_data.py --demo-buildings --months 12
```

That creates an `admin` account, five demo buildings with meters, and twelve months
of monthly readings. Change the admin password after your first sign-in.

If you already have your own buildings and meters and just want reading history:

```bash
python seed_demo_data.py --backfill --months 12    # keeps existing readings
python seed_demo_data.py --replace  --months 12    # deletes existing readings first
```

### 4. OCR model weights

The three trained checkpoints are not in the repository, being roughly 400 MB of
binaries. Download them and run:

```bash
cd enersight-backend
.\install_ocr_weights.ps1
```

See [app/ocr_models/weights/README.md](enersight-backend/app/ocr_models/weights/README.md).
**The pipeline works without them** — it falls back to EasyOCR alone and logs which
checkpoints are missing. Check what loaded with `GET /ocr/health`.

### 5. Frontend

```bash
cd enersight-frontend
npm install
npm run dev
```

Opens on <http://localhost:5173> and talks to the backend on port 8000 of the same
hostname.

### Running on a phone over USB

```powershell
.\adb-forward.ps1
```

Then open `http://localhost:5173` in the phone's browser.

---

## Data model

```
users                         buildings
├─ user_id (PK)               ├─ building_id (PK)
├─ username (unique)          ├─ name
├─ password_hash              ├─ address
├─ role      Admin|Manager|Staff
├─ full_name                  ├─ latitude, longitude     ← GIS position
└─ status    Pending|Active|Inactive|Rejected
                              ├─ floor_area              ← denominator for EUI
                              ├─ building_type
                              └─ status
        │                            │
        │                            ├──────────────┐
        │                            │              │
        │                       meters          appliances
        │                       ├─ meter_id (PK)  ├─ appliance_id (PK)
        │                       ├─ building_id(FK)├─ building_id (FK)
        │                       ├─ serial_no      ├─ name, category
        │                       ├─ meter_type     ├─ wattage
        │                       ├─ status         ├─ quantity
        │                       ├─ meter_category ├─ hours_per_day
        │                       ├─ installation_date
        │                       └─ initial_reading└─ days_per_month
        │                            │
        │                            │
        └──────────┐                 │
                   │                 │
            consumption_records ─────┘
            ├─ record_id (PK)
            ├─ meter_id (FK)
            ├─ user_id (FK)        ← who recorded it, taken from the token
            ├─ previous_reading    ← chained from the prior record
            ├─ reading_value       ← the meter face, always counts up
            ├─ reading_date        ← backdatable, so history can be entered
            ├─ image_path          ← served from /uploads/meter_photos/
            ├─ ocr_accuracy        ← NULL when typed by hand
            └─ is_verified         ← set only via PUT /readings/{id}/verify

access_log                    settings
├─ log_id (PK)                ├─ setting_id (PK)
├─ user_id (FK)               ├─ key (unique)      e.g. "rate_per_kwh"
├─ action_type                └─ value
└─ log_datetime
```

**Consumption is a difference, not a reading.** A meter face of 10,500 following one
of 10,000 means 500 kWh consumed. Every total in the system is a sum of
`reading_value - previous_reading`.

**Cost** is `consumption x rate_per_kwh`, where the rate is a single row in
`settings` that an Admin or Manager edits.

---

## Roles

| Capability | Admin | Manager | Staff |
|---|:---:|:---:|:---:|
| Dashboard, GIS map | yes | yes | yes |
| Record readings, run OCR | yes | — | yes |
| Create and edit buildings, meters | yes | yes | — |
| Delete buildings, meters, readings | yes | — | — |
| Verify readings | yes | yes | — |
| Manage appliances | yes | yes | — |
| Reports and analytics | yes | yes | — |
| Set the electricity rate | yes | yes | — |
| Manage user accounts | yes | — | — |
| Change own name and password | yes | yes | yes |

New sign-ups land as **Pending** and cannot log in until an Admin approves them.
Sign-up cannot request the Admin role.

---

## Energy-use intensity

A building's status comes from intensity, not raw kilowatt-hours, so a large
warehouse is not automatically worse than an inefficient small office:

```
EUI = total kWh / floor area (m²), scaled to a full year
```

| Band | Rule |
|---|---|
| Critical | EUI above 20 kWh/m²/year |
| High | EUI above 10 |
| Normal | EUI of 10 or below |
| No Data | no readings, or no floor area recorded |

These are the project's own operating bands, not a published standard. The single
definition lives in [src/utils/energyStatus.js](enersight-frontend/src/utils/energyStatus.js)
and is mirrored in [app/routes/map.py](enersight-backend/app/routes/map.py).

---

## OCR accuracy

Measure it against your own labelled photos rather than quoting the training run:

```bash
cd enersight-backend
python evaluate_ocr.py --images eval_data/images --labels eval_data/labels.csv
```

Reports exact-match and character accuracy for the shipped ensemble **and for each
of its four engines separately**, plus a confidence-calibration table and a
digit-confusion tally. See [eval_data/README.md](enersight-backend/eval_data/README.md)
for how to build a representative set.

---

## Project layout

```
enersight-backend/
  app/
    main.py            FastAPI app, router registration, /uploads mount
    models.py          SQLAlchemy models
    schemas.py         Pydantic request and response shapes
    auth.py            JWT, password hashing, role dependencies
    audit.py           access_log writes
    routes/            one module per resource
    ocr_models/        DTRB architectures, inference, weights
  seed_demo_data.py    admin bootstrap and reading history
  evaluate_ocr.py      OCR accuracy harness
  eval_data/           labelled photos for the harness

enersight-frontend/
  src/
    App.jsx            navigation, role gating, session handling
    pages/             one file per screen
    components/        shared UI
    hooks/             useAutoRefresh, useElectricityRate
    utils/             session, apiFetch, energyStatus, forecast, currency, password
```

---

## Known limitations

Worth stating plainly rather than being asked:

- **The GIS map needs internet.** Map tiles come from OpenStreetMap and reverse
  geocoding from Nominatim. Offline, the map renders as a grey box.
- **No database migrations.** `Base.metadata.create_all()` creates missing tables
  but never alters existing columns, so a schema change needs a manual `ALTER TABLE`
  or a dropped database.
- **The list pages load every reading.** There is no pagination or date-range
  filtering yet, and aggregation happens in the browser.
- **No automated test suite.** `evaluate_ocr.py` measures the OCR pipeline; the rest
  is verified by hand.
- **Photos are served without authentication.** Filenames are random UUIDs, which is
  a deliberate trade so `<img>` tags work without a bearer token.
