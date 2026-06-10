from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..auth import require_admin_or_manager
from ..database import get_db
from ..models import User
from .readings import reading_differential

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


@router.get("/summary")
def get_analytics_summary(db: Session = Depends(get_db), _: User = Depends(require_admin_or_manager)):
    buildings = db.query(models.Building).all()
    meters = db.query(models.Meter).all()
    readings = db.query(models.ConsumptionRecord).all()

    total_consumption = sum(reading_differential(reading) for reading in readings)

    average_reading = (
        total_consumption / len(readings)
        if readings
        else 0
    )

    highest_reading = (
        max(reading_differential(reading) for reading in readings)
        if readings
        else 0
    )

    low_accuracy_count = len(
        [
            reading
            for reading in readings
            if float(reading.ocr_accuracy or 0) < 90
        ]
    )

    verified_count = len([reading for reading in readings if reading.is_verified])
    pending_count = len([reading for reading in readings if not reading.is_verified])

    return {
        "total_buildings": len(buildings),
        "total_meters": len(meters),
        "total_readings": len(readings),
        "total_consumption": total_consumption,
        "average_reading": average_reading,
        "highest_reading": highest_reading,
        "low_accuracy_count": low_accuracy_count,
        "verified_count": verified_count,
        "pending_count": pending_count,
    }


@router.get("/building-comparison")
def get_building_comparison(db: Session = Depends(get_db), _: User = Depends(require_admin_or_manager)):
    buildings = db.query(models.Building).all()
    meters = db.query(models.Meter).all()
    readings = db.query(models.ConsumptionRecord).all()

    rows = []

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

        average_reading = (
            total_consumption / len(building_readings)
            if building_readings
            else 0
        )

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

        status = "Normal"

        if total_consumption >= 5000:
            status = "Critical"
        elif total_consumption >= 2500:
            status = "High"

        rows.append(
            {
                "building_id": building.building_id,
                "building_name": building.name,
                "meter_count": len(building_meters),
                "reading_count": len(building_readings),
                "total_consumption": total_consumption,
                "average_reading": average_reading,
                "average_accuracy": average_accuracy,
                "verified_count": verified_count,
                "pending_count": pending_count,
                "status": status,
            }
        )

    rows.sort(key=lambda row: row["total_consumption"], reverse=True)

    return rows


@router.get("/monthly-trend")
def get_monthly_trend(db: Session = Depends(get_db), _: User = Depends(require_admin_or_manager)):
    readings = db.query(models.ConsumptionRecord).all()

    monthly_data = {}

    for reading in readings:
        if not reading.reading_date:
            continue

        month_key = reading.reading_date.strftime("%Y-%m")
        month_label = reading.reading_date.strftime("%b %Y")

        if month_key not in monthly_data:
            monthly_data[month_key] = {
                "month": month_label,
                "consumption": 0,
                "readings": 0,
            }

        monthly_data[month_key]["consumption"] += reading_differential(reading)
        monthly_data[month_key]["readings"] += 1

    return [
        monthly_data[key]
        for key in sorted(monthly_data.keys())
    ]


@router.get("/ocr-status")
def get_ocr_status(db: Session = Depends(get_db), _: User = Depends(require_admin_or_manager)):
    readings = db.query(models.ConsumptionRecord).all()

    high_accuracy = len(
        [
            reading
            for reading in readings
            if float(reading.ocr_accuracy or 0) >= 90
        ]
    )

    needs_checking = len(
        [
            reading
            for reading in readings
            if float(reading.ocr_accuracy or 0) < 90
        ]
    )

    verified = len([reading for reading in readings if reading.is_verified])
    pending = len([reading for reading in readings if not reading.is_verified])

    return {
        "high_accuracy": high_accuracy,
        "needs_checking": needs_checking,
        "verified": verified,
        "pending": pending,
        "total": len(readings),
    }
