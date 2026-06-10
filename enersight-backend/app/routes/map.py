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


def compute_eui(total_consumption, floor_area):
    if not floor_area or float(floor_area) <= 0:
        return 0

    if not total_consumption or float(total_consumption) <= 0:
        return 0

    return float(total_consumption) / float(floor_area)


def get_energy_status(total_consumption, floor_area):
    eui = compute_eui(total_consumption, floor_area)

    if not total_consumption or float(total_consumption) <= 0:
        return "No Data"

    if not floor_area or float(floor_area) <= 0:
        return "No Data"

    if eui > 20:
        return "Critical"

    if eui > 10:
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

        eui = compute_eui(total_consumption, floor_area)

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

        average_accuracy = (
            sum(float(reading.ocr_accuracy or 0) for reading in building_readings)
            / len(building_readings)
            if building_readings
            else 0
        )

        verified_count = len(
            [reading for reading in building_readings if reading.is_verified]
        )

        pending_count = len(
            [reading for reading in building_readings if not reading.is_verified]
        )

        energy_status = get_energy_status(total_consumption, floor_area)

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

        status = get_energy_status(building_total, building_floor_area)

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
