from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..database import get_db
from ..models import User

router = APIRouter(
    prefix="/meters",
    tags=["Meters"],
)


@router.get("/", response_model=list[schemas.MeterResponse])
def get_meters(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    meters = db.query(models.Meter).order_by(models.Meter.meter_id).all()

    for meter in meters:
        last = (
            db.query(models.ConsumptionRecord)
            .filter(models.ConsumptionRecord.meter_id == meter.meter_id)
            .order_by(
                models.ConsumptionRecord.reading_date.desc(),
                models.ConsumptionRecord.record_id.desc(),
            )
            .first()
        )

        if last:
            meter.latest_reading = float(last.reading_value or 0.0)
            meter.previous_reading = float(last.previous_reading or 0.0)
        else:
            # No readings yet: the initial_reading is the starting/previous value.
            meter.latest_reading = float(meter.initial_reading or 0.0)
            meter.previous_reading = float(meter.initial_reading or 0.0)

    return meters


@router.post("/", response_model=schemas.MeterResponse)
def create_meter(
    meter: schemas.MeterCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    building = (
        db.query(models.Building)
        .filter(models.Building.building_id == meter.building_id)
        .first()
    )

    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    existing_meter = (
        db.query(models.Meter)
        .filter(models.Meter.serial_no == meter.serial_no)
        .first()
    )

    if existing_meter:
        raise HTTPException(status_code=400, detail="Meter serial number already exists")

    new_meter = models.Meter(**meter.model_dump())

    db.add(new_meter)
    db.commit()
    db.refresh(new_meter)

    return new_meter


@router.get("/{meter_id}", response_model=schemas.MeterResponse)
def get_meter(
    meter_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    meter = db.query(models.Meter).filter(models.Meter.meter_id == meter_id).first()

    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")

    return meter


@router.put("/{meter_id}", response_model=schemas.MeterResponse)
def update_meter(
    meter_id: int,
    updated_meter: schemas.MeterCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    meter = db.query(models.Meter).filter(models.Meter.meter_id == meter_id).first()

    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")

    building = (
        db.query(models.Building)
        .filter(models.Building.building_id == updated_meter.building_id)
        .first()
    )

    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    existing_meter = (
        db.query(models.Meter)
        .filter(
            models.Meter.serial_no == updated_meter.serial_no,
            models.Meter.meter_id != meter_id,
        )
        .first()
    )

    if existing_meter:
        raise HTTPException(status_code=400, detail="Meter serial number already exists")

    for key, value in updated_meter.model_dump().items():
        setattr(meter, key, value)

    db.commit()
    db.refresh(meter)

    return meter


@router.delete("/{meter_id}")
def delete_meter(
    meter_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    meter = db.query(models.Meter).filter(models.Meter.meter_id == meter_id).first()

    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")

    linked_readings_count = (
        db.query(models.ConsumptionRecord)
        .filter(models.ConsumptionRecord.meter_id == meter_id)
        .count()
    )

    if linked_readings_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot delete this meter because it already has consumption readings. "
                "Delete the related readings first, or keep the meter for record history."
            ),
        )

    db.delete(meter)
    db.commit()

    return {"message": "Meter deleted successfully"}
