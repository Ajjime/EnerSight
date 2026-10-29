import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)

from app.database import engine
from app.models import Base
# The old server-side aggregation routes (routes/analytics.py and the first
# routes/reports.py) were removed. The frontend never called either one: Analytics
# and Reports fetch /buildings/, /meters/ and /readings/ and aggregate client-side.
# They were also inconsistent with each other, because the old reports.py summed raw
# meter faces instead of differences, so a meter going 10,000 -> 10,500 reported
# 20,500 kWh instead of 500. Do not bring them back as they were. Today's
# routes/reports.py is different: it only stores snapshots of reports the browser
# already computed (audit support).
from app.routes import (
    appliances,
    auth,
    buildings,
    map,
    meters,
    ocr,
    readings,
    reports,
    settings,
    users,
)

# Create tables
Base.metadata.create_all(bind=engine)

# create_all never alters a table that already exists, so a column added to a model
# later only reached fresh databases. These are added in place if missing. Additive
# only: nothing here drops, renames or rewrites data.
_ADDED_COLUMNS = {
    "consumption_records": {"ocr_reading": "VARCHAR"},
}


def _add_missing_columns() -> None:
    existing_tables = inspect(engine).get_table_names()
    with engine.begin() as connection:
        for table, columns in _ADDED_COLUMNS.items():
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspect(engine).get_columns(table)}
            for name, sql_type in columns.items():
                if name not in present:
                    connection.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}")
                    )
                    logging.getLogger(__name__).info("Added column %s.%s", table, name)


_add_missing_columns()

# Initialize FastAPI app
app = FastAPI(
    title="EnerSight GIS API",
    description="Backend API for Building-Specific Energy Consumption Mapping and Optimization System using GIS",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(buildings.router)
app.include_router(meters.router)
app.include_router(readings.router)
app.include_router(users.router)
app.include_router(auth.router)
app.include_router(ocr.router)
app.include_router(map.router)
app.include_router(appliances.router)
app.include_router(reports.router)
app.include_router(settings.router)

# Serve saved meter photos. Without this mount a reading's image_path pointed at
# nothing, so an OCR reading could never be traced back to the photo it came from —
# the evidence trail for the system's whole premise.
#
# Note this is public: anyone who knows a filename can fetch it. The names are
# random UUIDs rather than anything guessable, which is a deliberate trade so that
# <img> tags work without attaching a bearer token. Put it behind an authenticated
# handler if the photos are ever sensitive.
_UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")

# Root endpoint
@app.get("/")
def root():
    return {"message": "EnerSight GIS API is running"}