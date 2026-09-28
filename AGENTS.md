# AGENTS.md

Working rules for any AI agent (or contributor) making changes in this repository.

## Before making changes

- Read `knowledge.md` first for architecture and contracts.
- Create a feature branch. Do not commit directly to `main`.
- Keep changes small and scoped to one feature or refactor at a time.

## Boundaries

- `enersight-backend/app/` — FastAPI backend. Route modules under `app/routes/` each own one resource (buildings, meters, readings, users, auth, ocr, map, reports, analytics). Don't cross-edit unrelated routers for a single task.
- `enersight-frontend/src/pages/` — one page per screen. `src/components/` holds shared UI. `src/hooks/` holds shared stateful logic (e.g. `useAutoRefresh`).
- Never commit `.env`, `venv/`, `node_modules/`, or anything under `uploads/`/`meter_photos/` (already covered by `.gitignore`).
- Never hardcode secrets (API keys, DB passwords) in source files — use `.env` (see `enersight-backend/.env.example`).

## Required checks before calling a task done

- Backend: `python -m py_compile app/main.py` (or run the server and hit the touched endpoint).
- Frontend: `npm run lint` and `npm run build` in `enersight-frontend/`.
- Manually exercise the touched flow in the browser — there is no automated test suite yet, so this is the only verification available.
- Report which checks were run and their result; don't claim a change works without running it.

## Known constraints (see knowledge.md for detail)

- `DATABASE_URL` (PostgreSQL) is required — the backend will not start without it.
- `SECRET_KEY` for JWT auth is currently hardcoded in `app/auth.py` — flag this if touching auth, don't silently "fix" it without asking (it's a known pre-existing issue, not in scope unless asked).
- OCR (`app/routes/ocr.py`) can run locally via EasyOCR or defer to Gemini/Anthropic if `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` are set.
