from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_user
from ..database import get_db
from ..models import User
from .readings import reading_differential

router = APIRouter(
    prefix="/map",
    tags=["GIS Map"],
)


# Operating bands for energy-use intensity, in kWh per square metre per year.
# Mirrored on the frontend in src/utils/energyStatus.js; change both together.
EUI_CRITICAL_THRESHOLD = 20
EUI_HIGH_THRESHOLD = 10

# Below this many days an extrapolation to a full year is noise, not a signal.
# Was 28, which left some one-month intervals (they run about 25 to 34 days) judged
# against yearly thresholds. Mirrored in src/utils/energyStatus.js.
MIN_DAYS_TO_ANNUALIZE = 20
DAYS_PER_YEAR = 365


def reading_span_days(readings) -> float:
    """Days between the earliest and latest reading, used to annualise intensity."""
    dates = [reading.reading_date for reading in readings if reading.reading_date]

    if len(dates) < 2:
        return 0.0

    span = (max(dates) - min(dates)).total_seconds() / 86400.0

    return span if span > 0 else 0.0


def compute_eui(total_consumption, floor_area, span_days: float = 0.0):
    """Energy-use intensity, annualised when there is enough history to justify it.

    Without annualising, intensity is cumulative and grows forever as readings
    accumulate, so every building eventually crosses into Critical purely because
    it has been monitored for longer.
    """
    if not floor_area or float(floor_area) <= 0:
        return 0

    if not total_consumption or float(total_consumption) <= 0:
        return 0

    eui = float(total_consumption) / float(floor_area)

    if span_days and span_days >= MIN_DAYS_TO_ANNUALIZE:
        eui = eui * (DAYS_PER_YEAR / span_days)

    return eui


def get_energy_status(total_consumption, floor_area, span_days: float = 0.0):
    if not total_consumption or float(total_consumption) <= 0:
        return "No Data"

    if not floor_area or float(floor_area) <= 0:
        return "No Data"

    eui = compute_eui(total_consumption, floor_area, span_days)

    if eui > EUI_CRITICAL_THRESHOLD:
        return "Critical"

    if eui > EUI_HIGH_THRESHOLD:
        return "High"

    return "Normal"


@router.get("/buildings")
def get_building_map_data(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    buildings = db.query(models.Building).order_by(models.Building.building_id).all()
    meters = db.query(models.Meter).all()
    readings = db.query(models.ConsumptionRecord).all()

    map_rows = []

    for building in buildings:
        building_meters = [
            meter for meter in meters if meter.building_id == building.building_id
        ]

        meter_ids = [meter.meter_id for meter in building_meters]

        building_readings = [
            reading for reading in readings if reading.meter_id in meter_ids
        ]

        total_consumption = sum(
            reading_differential(reading) for reading in building_readings
        )

        floor_area = float(building.floor_area or 0)
        span_days = reading_span_days(building_readings)

        eui = compute_eui(total_consumption, floor_area, span_days)

        latest_reading = 0
        latest_reading_date = None

        if building_readings:
            sorted_readings = sorted(
                building_readings,
                key=lambda reading: reading.reading_date,
                reverse=True,
            )

            latest_reading = float(sorted_readings[0].reading_value or 0)
            latest_reading_date = sorted_readings[0].reading_date

        # Manual readings have no OCR score (NULL, or 0 from older form saves), so
        # they are left out rather than averaged in as 0% accurate.
        scored_accuracies = [
            float(reading.ocr_accuracy)
            for reading in building_readings
            if reading.ocr_accuracy and float(reading.ocr_accuracy) > 0
        ]

        average_accuracy = (
            sum(scored_accuracies) / len(scored_accuracies)
            if scored_accuracies
            else 0
        )

        verified_count = len(
            [reading for reading in building_readings if reading.is_verified]
        )

        pending_count = len(
            [reading for reading in building_readings if not reading.is_verified]
        )

        energy_status = get_energy_status(total_consumption, floor_area, span_days)

        map_rows.append(
            {
                "building_id": building.building_id,
                "name": building.name,
                "latitude": building.latitude,
                "longitude": building.longitude,
                "floor_area": floor_area,
                "building_type": building.building_type,
                "building_status": building.status,
                "energy_status": energy_status,
                "eui": eui,
                "meter_count": len(building_meters),
                "reading_count": len(building_readings),
                "total_consumption": total_consumption,
                "latest_reading": latest_reading,
                "latest_reading_date": latest_reading_date,
                "average_accuracy": average_accuracy,
                "verified_count": verified_count,
                "pending_count": pending_count,
            }
        )

    return map_rows


@router.get("/summary")
def get_map_summary(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    buildings = db.query(models.Building).all()
    meters = db.query(models.Meter).all()
    readings = db.query(models.ConsumptionRecord).all()

    building_ids_with_coordinates = [
        building.building_id
        for building in buildings
        if building.latitude is not None and building.longitude is not None
    ]

    total_consumption = sum(reading_differential(reading) for reading in readings)

    critical_buildings = 0
    high_buildings = 0
    normal_buildings = 0
    no_data_buildings = 0

    for building in buildings:
        building_meters = [
            meter for meter in meters if meter.building_id == building.building_id
        ]

        meter_ids = [meter.meter_id for meter in building_meters]

        building_readings = [
            reading for reading in readings if reading.meter_id in meter_ids
        ]

        building_total = sum(
            reading_differential(reading) for reading in building_readings
        )

        building_floor_area = float(building.floor_area or 0)

        status = get_energy_status(
            building_total,
            building_floor_area,
            reading_span_days(building_readings),
        )

        if status == "Critical":
            critical_buildings += 1
        elif status == "High":
            high_buildings += 1
        elif status == "Normal":
            normal_buildings += 1
        else:
            no_data_buildings += 1

    return {
        "total_buildings": len(buildings),
        "mapped_buildings": len(building_ids_with_coordinates),
        "total_meters": len(meters),
        "total_readings": len(readings),
        "total_consumption": total_consumption,
        "critical_buildings": critical_buildings,
        "high_buildings": high_buildings,
        "normal_buildings": normal_buildings,
        "no_data_buildings": no_data_buildings,
    }
