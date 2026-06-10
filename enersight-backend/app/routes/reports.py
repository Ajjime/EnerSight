from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..auth import require_admin_or_manager
from ..database import get_db
from ..models import User

router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
)


@router.get("/summary")
def get_reports_summary(db: Session = Depends(get_db), _: User = Depends(require_admin_or_manager)):
    buildings = db.query(models.Building).all()
    meters = db.query(models.Meter).all()
    readings = db.query(models.ConsumptionRecord).all()

    total_energy = sum(float(reading.reading_value or 0) for reading in readings)
    verified_readings = len([reading for reading in readings if reading.is_verified])
    pending_readings = len([reading for reading in readings if not reading.is_verified])

    highest_reading = 0

    if readings:
        highest_reading = max(float(reading.reading_value or 0) for reading in readings)

    return {
        "total_buildings": len(buildings),
        "total_meters": len(meters),
        "total_readings": len(readings),
        "total_energy": total_energy,
        "verified_readings": verified_readings,
        "pending_readings": pending_readings,
        "highest_reading": highest_reading,
    }


@router.get("/building-consumption")
def get_building_consumption_report(db: Session = Depends(get_db), _: User = Depends(require_admin_or_manager)):
    buildings = db.query(models.Building).all()
    meters = db.query(models.Meter).all()
    readings = db.query(models.ConsumptionRecord).all()

    report_rows = []

    for building in buildings:
        building_meters = [
            meter for meter in meters if meter.building_id == building.building_id
        ]

        building_meter_ids = [meter.meter_id for meter in building_meters]

        building_readings = [
            reading for reading in readings if reading.meter_id in building_meter_ids
        ]

        total_consumption = sum(
            float(reading.reading_value or 0) for reading in building_readings
        )

        average_consumption = (
            total_consumption / len(building_readings)
            if building_readings
            else 0
        )

        highest_consumption = (
            max(float(reading.reading_value or 0) for reading in building_readings)
            if building_readings
            else 0
        )

        verified_count = len(
            [reading for reading in building_readings if reading.is_verified]
        )

        pending_count = len(
            [reading for reading in building_readings if not reading.is_verified]
        )

        report_rows.append(
            {
                "building_id": building.building_id,
                "building_name": building.name,
                "meter_count": len(building_meters),
                "reading_count": len(building_readings),
                "total_consumption": total_consumption,
                "average_consumption": average_consumption,
                "highest_consumption": highest_consumption,
                "verified_count": verified_count,
                "pending_count": pending_count,
            }
        )

    return report_rows


@router.get("/ocr-status")
def get_ocr_status_report(db: Session = Depends(get_db), _: User = Depends(require_admin_or_manager)):
    readings = db.query(models.ConsumptionRecord).all()

    high_accuracy = len(
        [reading for reading in readings if float(reading.ocr_accuracy or 0) >= 90]
    )

    needs_checking = len(
        [reading for reading in readings if float(reading.ocr_accuracy or 0) < 90]
    )

    verified = len([reading for reading in readings if reading.is_verified])
    pending = len([reading for reading in readings if not reading.is_verified])

    return {
        "total_readings": len(readings),
        "high_accuracy": high_accuracy,
        "needs_checking": needs_checking,
        "verified": verified,
        "pending": pending,
    }
