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


def get_last_reading(db: Session, meter_id: int):
    """The meter's most recent record (latest date, then highest id), or None."""
    return (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.meter_id == meter_id)
        .order_by(
            models.ConsumptionRecord.reading_date.desc(),
            models.ConsumptionRecord.record_id.desc(),
        )
        .first()
    )


def get_last_reading_value(db: Session, meter_id: int):
    """Returns (reading_value, has_prior) for the most recent record of this meter.
    Falls back to the meter's initial_reading when no records exist yet."""
    last = get_last_reading(db, meter_id)
    if last:
        return float(last.reading_value), True
    meter = db.query(models.Meter).filter(models.Meter.meter_id == meter_id).first()
    initial = float(meter.initial_reading or 0.0) if meter else 0.0
    return initial, False


def get_neighbours(db: Session, record):
    """(reading before, reading after) this one on the same meter, in the order the
    chain runs: by date, then by id. Either may be None."""
    chain = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.meter_id == record.meter_id)
        .order_by(
            models.ConsumptionRecord.reading_date.asc(),
            models.ConsumptionRecord.record_id.asc(),
        )
        .all()
    )
    index = next(
        (i for i, item in enumerate(chain) if item.record_id == record.record_id), None
    )

    if index is None:
        return None, None

    before = chain[index - 1] if index > 0 else None
    after = chain[index + 1] if index + 1 < len(chain) else None

    return before, after


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
        # The meter's starting reading (last_value falls back to it). 0 here
        # counted a running meter's whole register as its first reading's use.
        reading_data["previous_reading"] = last_value

    reading_data = apply_reading_rules(reading_data)

    # Each reading measures from the one dated before it, and its previous value is
    # the latest reading's. Slipping one in earlier would measure it from a later
    # reading and leave the chain after it counting the same kWh twice.
    last = get_last_reading(db, reading.meter_id) if has_prior else None
    new_date = reading_data.get("reading_date")

    if last and new_date is not None and new_date < last.reading_date:
        raise HTTPException(
            status_code=400,
            # No date in the message: the stored one is UTC and would print a day
            # off for a reading taken before 8 AM in the Philippines.
            detail=(
                "This reading is dated before the meter's latest reading. "
                "Readings go in date order."
            ),
        )

    # Attribution comes from the token, never from the request body.
    reading_data["user_id"] = current_user.user_id
    # Every new reading is approved as it is saved (the user's choice, Nov 2026);
    # the form warns before saving when OCR was unsure or the number looks wrong.
    # Set here, never taken from the request. An Admin or Manager can still send a
    # reading back with PUT /readings/{id}/review.
    reading_data["is_verified"] = True

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

    # Moving a reading to another meter would break two chains at once.
    if updated_reading.meter_id != reading.meter_id:
        raise HTTPException(
            status_code=400,
            detail="A reading cannot move to another meter. Delete it and add it to the right one.",
        )

    before, after = get_neighbours(db, reading)
    reading_data = updated_reading.model_dump()

    # The previous value is the reading before this one, as on create. Only a
    # meter's first reading takes it from the request.
    if before is not None:
        reading_data["previous_reading"] = float(before.reading_value)
    elif reading_data.get("previous_reading") is None:
        reading_data["previous_reading"] = float(reading.previous_reading or 0.0)

    # user_id and is_verified are no longer accepted as input, so an edit can no
    # longer reassign who recorded a reading, nor silently unverify it by omitting
    # the field (the schema default used to be False).
    #
    # Popping an omitted reading_date keeps the record's existing timestamp.
    reading_data = apply_reading_rules(reading_data)

    new_date = reading_data.get("reading_date", reading.reading_date)

    if (before is not None and new_date < before.reading_date) or (
        after is not None and new_date > after.reading_date
    ):
        raise HTTPException(
            status_code=400,
            detail="The new date would move this reading past its neighbours. Readings go in date order.",
        )

    new_value = float(reading_data["reading_value"])

    if after is not None and float(after.reading_value) < new_value:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Reading {new_value:,.2f} is higher than the next reading on this "
                f"meter ({float(after.reading_value):,.2f}). A meter only counts up."
            ),
        )

    # What OCR originally read is evidence, not an editable field. An edit form
    # that does not send it would otherwise erase it.
    reading_data.pop("ocr_reading", None)

    for key, value in reading_data.items():
        setattr(reading, key, value)

    # The next reading measures from this one, so it follows the new value. Left
    # alone, the two would disagree about the register and the kWh between them
    # would be counted twice or lost.
    if after is not None:
        after.previous_reading = new_value

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

    # The next reading takes over this one's starting value, so its interval now
    # runs across both and no kWh are lost. Without this it kept measuring from the
    # deleted value: deleting the middle of three monthly readings dropped a third
    # of the energy.
    _, after = get_neighbours(db, reading)

    if after is not None:
        after.previous_reading = reading.previous_reading

    audit.log_action(
        db,
        audit.READING_DELETED,
        current_user.user_id,
        f"#{reading.record_id} meter={reading.meter_id} value={reading.reading_value}",
    )

    db.delete(reading)
    db.commit()

    return {"message": "Reading deleted successfully"}
