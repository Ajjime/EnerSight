import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)

from app.database import engine
from app.models import Base
from app.routes import (
    analytics,
    auth,
    buildings,
    map,
    meters,
    ocr,
    readings,
    reports,
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
app.include_router(reports.router)
app.include_router(analytics.router)

# Root endpoint
@app.get("/")
def root():
    return {"message": "EnerSight GIS API is running"}