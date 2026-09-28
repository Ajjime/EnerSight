# EnerSight

Building-Specific Energy Consumption Mapping and Optimization System using GIS.

- `enersight-backend/` — FastAPI + SQLAlchemy + PostgreSQL API (buildings, meters, readings, users, auth, OCR, map, reports, analytics).
- `enersight-frontend/` — React (Vite) + Tailwind + Leaflet map UI.

## Prerequisites

- Node.js 22.13+ with npm
- Python 3.12+
- A running PostgreSQL instance

## Backend setup

```bash
cd enersight-backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then fill in DATABASE_URL
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Windows shortcut: `start-backend.bat` (expects `venv` to already exist in `enersight-backend/`).

API docs once running: http://localhost:8000/docs

## Frontend setup

```bash
cd enersight-frontend
npm install
npm run dev
```

Windows shortcut: `start-frontend.bat`.

The frontend auto-targets the backend at `http://<current-hostname>:8000` (see `src/config.js`) — no `.env` needed on this side.

## Checks

| Purpose | Command |
|---|---|
| Frontend lint | `npm run lint` (in `enersight-frontend/`) |
| Frontend build | `npm run build` (in `enersight-frontend/`) |
| Backend import/syntax sanity | `python -m py_compile app/main.py` (in `enersight-backend/`, venv active) |

There is currently no automated test suite (no pytest, no frontend test script) — verification is manual: run both servers and exercise the flow in the browser.

## Manual smoke test

1. Start backend and frontend as above.
2. Log in / register a user (`auth` routes).
3. Open the building map (`map` routes, Leaflet).
4. Add or view a meter and a reading.
5. Check Dashboard / Analytics / Reports pages render data.

## Mock data

`enersight-frontend/src/data/mockData.js` holds sample data usable for UI-only work without a live backend. The backend itself requires a real PostgreSQL database — no seed script exists yet.
