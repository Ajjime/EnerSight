# knowledge.md

Verified facts about the EnerSight project. Keep this file accurate — update it when the project changes.

## Architecture

```
EnerSight/
  enersight-backend/
    app/main.py           FastAPI app, CORS, router registration, table creation
    app/database.py       SQLAlchemy engine/session, reads DATABASE_URL
    app/models.py          ORM models (source of truth for the schema)
    app/schemas.py         Pydantic request/response models
    app/auth.py             Password hashing + JWT issue/verify
    app/routes/             One router module per resource
  enersight-frontend/
    src/pages/              One component per screen (Dashboard, BuildingMap, MetersPage, ...)
    src/components/         Shared UI (modals, header, toast, ui.jsx)
    src/hooks/               useAutoRefresh, useLocalStorageList
    src/data/mockData.js     Sample data for UI-only work
    src/config.js            Resolves API_BASE_URL from window.location.hostname
```

Data flow: React page → `apiFetch` (src/utils/apiFetch.js) → FastAPI router → SQLAlchemy model → PostgreSQL. Map view additionally renders through Leaflet (`react-leaflet`).

## Data model (`app/models.py`)

- `User` (`users`) — accounts, roles, approval state (used by `auth`/`users` routes).
- `Building` (`buildings`) — GIS-located building records.
- `Meter` (`meters`) — belongs to a building.
- `ConsumptionRecord` (`consumption_records`) — meter readings (created via `readings` routes, verified/reviewed by state fields).
- `EnergyReport` (`energy_reports`) — generated report records.
- `AccessLog` (`access_log`) — audit trail.

## API surface (prefixes as registered in `app/main.py`)

| Router | Prefix (approx.) | Notes |
|---|---|---|
| `buildings` | `/buildings` | CRUD |
| `meters` | `/meters` | CRUD, scoped to a building |
| `readings` | `/readings` | CRUD + `/verify` and `/review` state transitions |
| `users` | `/users` | CRUD + `/approve`, `/reject`, `/pending` |
| `auth` | `/auth` | `/login`, `/me` (GET/PUT) |
| `ocr` | `/ocr` | `/health`, `/meter-photo` (EasyOCR, optional Gemini/Claude assist) |
| `map` | `/map` | `/buildings`, `/summary` — GIS-oriented read views |
| `reports` | `/reports` | `/summary`, `/building-consumption`, `/ocr-status` |
| `analytics` | `/analytics` | `/summary`, `/building-comparison`, `/monthly-trend`, `/ocr-status` |

All routers except `auth`/public endpoints are expected to sit behind the bearer-token auth in `app/auth.py` — check each router's `Depends(...)` before assuming a route is open.

## Deliberate constraints / known issues

- `DATABASE_URL` (PostgreSQL) is mandatory; there is no SQLite fallback and no seed script — a fresh clone needs a real Postgres instance to run the backend.
- JWT `SECRET_KEY` is hardcoded in `app/auth.py` (not read from env) — pre-existing, do not silently change without being asked.
- No automated test suite exists (backend or frontend). Verification is manual (see AGENTS.md).
- OCR route depends on `torch`/`torchvision`/`easyocr` — first run downloads model weights and can be slow; this is expected, not a bug.
- Frontend has no `.env` — the API base URL is derived from the browser's current hostname, so backend and frontend must be reachable on the same host/IP during a demo.

## Recorded baseline (2026-09-28, branch `claude/nifty-mendel-pyxyq8`)

- `npm run build` in `enersight-frontend/` — **passes**. Output warns the main JS chunk is >500kB (pre-existing, not a blocker).
- Backend Python files pass `python -m py_compile` (syntax-only; full backend was not run end-to-end because it requires a live `DATABASE_URL`).
- `npm run lint` originally failed with 28 problems (24 errors, 4 warnings). 12 were genuinely dead code (unused imports/state/function in `Analytics.jsx`, `BuildingMap.jsx`, `Dashboard.jsx`, `UploadOCR.jsx`) and were removed as a bounded cleanup — no runtime behavior changed, verified by re-running lint and build after.

### Remaining lint findings — pre-existing, left untouched on purpose

- **`no-unused-vars` on 7 `icon: Icon` destructured props** (`Analytics.jsx:151`, `BuildingMap.jsx:298`, `Dashboard.jsx:539`, `ProfilePage.jsx:103,125`, `SettingsPage.jsx:149,182`) — **false positives**. Each `Icon` is genuinely rendered via `<Icon .../>` a few lines below; this project's `eslint.config.js` doesn't include `eslint-plugin-react`, so ESLint's core `no-unused-vars` isn't JSX-aware for this destructuring-rename pattern. Do not delete these — deleting would break the rendered icon.
- **3× `react-hooks/set-state-in-effect`** (`LocationPickerModal.jsx:131`, `UploadOCR.jsx:534,539`) — setState called synchronously inside `useEffect`. Real refactors (move logic to an event handler / derive during render), not a delete-a-line fix; needs per-component behavioral review, so left for a dedicated task.
- **1× `react-hooks/static-components`** (`Dashboard.jsx:515`) — `ForecastTooltip` is declared inside the parent's render body instead of module scope; moving it changes closures over local variables (`data`), needs care.
- **1× `react-refresh/only-export-components`** (`ui.jsx:4`) — dev-experience only (breaks Fast Refresh for that file), not a runtime bug.
- **4× `react-hooks/exhaustive-deps` warnings** (`Analytics.jsx`, `MetersPage.jsx`, `Reports.jsx` ×2) — adding the missing deps risks introducing re-render loops; needs testing per case, not a blind add.
