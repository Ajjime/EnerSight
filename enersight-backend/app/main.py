import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)

from app.database import engine
from app.models import Base
# routes/analytics.py and routes/reports.py were removed. The frontend never called
# either one: Analytics and Reports fetch /buildings/, /meters/ and /readings/ and
# aggregate client-side. They were also inconsistent with each other, because
# reports.py summed raw meter faces instead of differences, so a meter going
# 10,000 -> 10,500 reported 20,500 kWh instead of 500. Recover from git history if
# server-side aggregation is added later; do not re-register them as they were.
from app.routes import (
    appliances,
    auth,
    buildings,
    map,
    meters,
    ocr,
    readings,
    settings,
    users,
)

# Create tables
Base.metadata.create_all(bind=engine)

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