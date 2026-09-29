---
name: enersight-backend-route
description: Plan, implement, or review a change to an EnerSight FastAPI route, its Pydantic schema, or its SQLAlchemy model (app/routes, app/models.py, app/schemas.py)
---

1. Read `knowledge.md` for the data model and API surface table, then open the target router in `enersight-backend/app/routes/`.
2. Trace the full path for the endpoint you're touching: router function → `app/schemas.py` (request/response shape) → `app/models.py` (table) → `app/database.py` (`get_db` session). Confirm which fields are required/optional in the schema before changing a payload.
3. Respect existing conventions:
   - Auth: routes that should be protected use `Depends(...)` from `app/auth.py` — check a sibling endpoint in the same router before assuming a new one should or shouldn't require it.
   - `SECRET_KEY` in `app/auth.py` is hardcoded (pre-existing, out of scope unless explicitly asked to fix).
   - `DATABASE_URL` (PostgreSQL) is required; there's no SQLite fallback — don't add code that assumes SQLite.
4. Keep the change to one router/resource at a time. Don't cross-edit unrelated routers in the same task.
5. Verify before calling it done:
   - `python -m py_compile app/main.py app/routes/<touched_file>.py` (with the venv active) as a minimum syntax check.
   - Prefer running the server end-to-end against a real Postgres DB (`uvicorn app.main:app --reload`) and hitting the touched endpoint with `curl` or `/docs`, confirming it returns the expected status code (not a 500) and the expected shape.
   - If the endpoint is consumed by the frontend, confirm the calling code in `enersight-frontend/src` still matches the response shape.
