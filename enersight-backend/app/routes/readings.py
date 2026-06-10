from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin, require_admin_or_manager, require_admin_or_staff
from ..database import get_db
from ..models import User

router = APIRouter(
    prefix="/readings",
    tags=["Consumption Readings"],
)


def get_last_reading_value(db: Session, meter_id: int):
    """Returns (reading_value, has_prior) for the most recent record of this meter.
    Falls back to the meter's initial_reading when no records exist yet."""
    last = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.meter_id == meter_id)
        .order_by(
            models.ConsumptionRecord.reading_date.desc(),
            models.ConsumptionRecord.record_id.desc(),
        )
        .first()
    )
    if last:
        return float(last.reading_value), True
    meter = db.query(models.Meter).filter(models.Meter.meter_id == meter_id).first()
    initial = float(meter.initial_reading or 0.0) if meter else 0.0
    return initial, False


def reading_differential(record) -> float:
    """Returns present - previous, clamped to 0 to prevent negatives."""
    return max(float(record.reading_value or 0) - float(record.previous_reading or 0), 0.0)


@router.get("/meter/{meter_id}/last")
def get_last_reading_for_meter(
    meter_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    last_value, has_prior = get_last_reading_value(db, meter_id)
    return {"reading_value": last_value, "has_prior": has_prior}


@router.get("/", response_model=list[schemas.ReadingResponse])
def get_readings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    readings = (
        db.query(models.ConsumptionRecord)
        .order_by(models.ConsumptionRecord.record_id.desc())
        .all()
    )

    return readings


@router.post("/", response_model=schemas.ReadingResponse)
def create_reading(
    reading: schemas.ReadingCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_staff),
):
    meter = (
        db.query(models.Meter)
        .filter(models.Meter.meter_id == reading.meter_id)
        .first()
    )

    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")

    if reading.user_id is not None:
        user = (
            db.query(models.User)
            .filter(models.User.user_id == reading.user_id)
            .first()
        )

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

    last_value, has_prior = get_last_reading_value(db, reading.meter_id)
    reading_data = reading.model_dump()

    if has_prior:
        reading_data["previous_reading"] = last_value
    elif reading_data.get("previous_reading") is None:
        reading_data["previous_reading"] = 0.0

    new_reading = models.ConsumptionRecord(**reading_data)

    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)

    return new_reading


@router.get("/{record_id}", response_model=schemas.ReadingResponse)
def get_reading(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    reading = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.record_id == record_id)
        .first()
    )

    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    return reading


@router.put("/{record_id}", response_model=schemas.ReadingResponse)
def update_reading(
    record_id: int,
    updated_reading: schemas.ReadingCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_manager),
):
    reading = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.record_id == record_id)
        .first()
    )

    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    meter = (
        db.query(models.Meter)
        .filter(models.Meter.meter_id == updated_reading.meter_id)
        .first()
    )

    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")

    if updated_reading.user_id is not None:
        user = (
            db.query(models.User)
            .filter(models.User.user_id == updated_reading.user_id)
            .first()
        )

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

    for key, value in updated_reading.model_dump().items():
        setattr(reading, key, value)

    db.commit()
    db.refresh(reading)

    return reading


@router.put("/{record_id}/verify", response_model=schemas.ReadingResponse)
def verify_reading(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_manager),
):
    reading = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.record_id == record_id)
        .first()
    )

    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    reading.is_verified = True

    db.commit()
    db.refresh(reading)

    return reading


@router.put("/{record_id}/review", response_model=schemas.ReadingResponse)
def mark_reading_for_review(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_manager),
):
    reading = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.record_id == record_id)
        .first()
    )

    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    reading.is_verified = False

    db.commit()
    db.refresh(reading)

    return reading


@router.delete("/{record_id}")
def delete_reading(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    reading = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.record_id == record_id)
        .first()
    )

    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    db.delete(reading)
    db.commit()

    return {"message": "Reading deleted successfully"}
