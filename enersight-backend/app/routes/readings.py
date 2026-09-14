from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import audit, models, schemas
from ..auth import get_current_user, require_admin, require_admin_or_manager, require_admin_or_staff
from ..database import get_db
from ..models import User

router = APIRouter(
    prefix="/readings",
    tags=["Consumption Readings"],
)


def to_naive_utc(value: datetime) -> datetime:
    """The reading_date column is naive, but clients send ISO strings with a 'Z'
    suffix which Pydantic parses as tz-aware. Normalise so comparisons and stores
    don't mix the two and raise TypeError."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def apply_reading_rules(reading_data: dict) -> dict:
    """Shared validation for create and update.

    A meter face only counts up, so a present reading below the previous one is a
    typo or a misread photo. Accepting it would be silently destructive:
    reading_differential clamps the negative to 0, so the period reads as zero
    consumption and the next reading's differential is computed against a bad base.
    """
    present = float(reading_data.get("reading_value") or 0.0)
    previous = float(reading_data.get("previous_reading") or 0.0)

    if present < previous:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Reading {present:,.2f} is lower than the previous reading "
                f"{previous:,.2f}. A meter only counts up, so please re-check the "
                "photo or correct the value before saving."
            ),
        )

    # Backdating is allowed and necessary for historical data. Post-dating is not.
    reading_date = reading_data.get("reading_date")

    if reading_date is None:
        # Drop the key entirely: passing None explicitly would write NULL and
        # bypass the column's utcnow default.
        reading_data.pop("reading_date", None)
    else:
        reading_date = to_naive_utc(reading_date)

        if reading_date > datetime.utcnow():
            raise HTTPException(
                status_code=400,
                detail="Reading date cannot be in the future.",
            )

        reading_data["reading_date"] = reading_date

    return reading_data


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
    current_user: User = Depends(require_admin_or_staff),
):
    meter = (
        db.query(models.Meter)
        .filter(models.Meter.meter_id == reading.meter_id)
        .first()
    )

    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")

    last_value, has_prior = get_last_reading_value(db, reading.meter_id)
    reading_data = reading.model_dump()

    if has_prior:
        reading_data["previous_reading"] = last_value
    elif reading_data.get("previous_reading") is None:
        reading_data["previous_reading"] = 0.0

    reading_data = apply_reading_rules(reading_data)

    # Attribution comes from the token, never from the request body.
    reading_data["user_id"] = current_user.user_id

    new_reading = models.ConsumptionRecord(**reading_data)

    db.add(new_reading)
    db.flush()
    audit.log_action(
        db,
        audit.READING_CREATED,
        current_user.user_id,
        f"#{new_reading.record_id} meter={new_reading.meter_id} "
        f"value={new_reading.reading_value}",
    )
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
    current_user: User = Depends(require_admin_or_manager),
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

    # user_id and is_verified are no longer accepted as input, so an edit can no
    # longer reassign who recorded a reading, nor silently unverify it by omitting
    # the field (the schema default used to be False).
    #
    # Popping an omitted reading_date keeps the record's existing timestamp.
    reading_data = apply_reading_rules(updated_reading.model_dump())

    for key, value in reading_data.items():
        setattr(reading, key, value)

    audit.log_action(
        db, audit.READING_UPDATED, current_user.user_id, f"#{reading.record_id}"
    )

    db.commit()
    db.refresh(reading)

    return reading


@router.put("/{record_id}/verify", response_model=schemas.ReadingResponse)
def verify_reading(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
):
    reading = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.record_id == record_id)
        .first()
    )

    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    reading.is_verified = True

    audit.log_action(
        db, audit.READING_VERIFIED, current_user.user_id, f"#{reading.record_id}"
    )

    db.commit()
    db.refresh(reading)

    return reading


@router.put("/{record_id}/review", response_model=schemas.ReadingResponse)
def mark_reading_for_review(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
):
    reading = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.record_id == record_id)
        .first()
    )

    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    reading.is_verified = False

    audit.log_action(
        db, audit.READING_UNVERIFIED, current_user.user_id, f"#{reading.record_id}"
    )

    db.commit()
    db.refresh(reading)

    return reading


@router.delete("/{record_id}")
def delete_reading(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    reading = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.record_id == record_id)
        .first()
    )

    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    audit.log_action(
        db,
        audit.READING_DELETED,
        current_user.user_id,
        f"#{reading.record_id} meter={reading.meter_id} value={reading.reading_value}",
    )

    db.delete(reading)
    db.commit()

    return {"message": "Reading deleted successfully"}
