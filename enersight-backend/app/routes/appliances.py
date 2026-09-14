from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin_or_manager
from ..database import get_db
from ..models import User
from .settings import get_rate_per_kwh

router = APIRouter(
    prefix="/appliances",
    tags=["Appliances"],
)


def appliance_kwh_month(appliance) -> float:
    """Estimated monthly energy use (kWh) for an appliance.

    Energy (kWh) = Watts x quantity x hours/day x days/month / 1000.
    The /1000 converts watts to kilowatts; 1 kWh = 1 billed unit.
    """
    watts = float(appliance.wattage or 0)
    quantity = int(appliance.quantity or 0)
    hours = float(appliance.hours_per_day or 0)
    days = int(appliance.days_per_month or 0)

    return round((watts * quantity * hours * days) / 1000.0, 2)


def serialize_appliance(appliance, rate: float) -> dict:
    kwh = appliance_kwh_month(appliance)

    return {
        "appliance_id": appliance.appliance_id,
        "building_id": appliance.building_id,
        "name": appliance.name,
        "category": appliance.category,
        "wattage": appliance.wattage,
        "quantity": appliance.quantity,
        "hours_per_day": appliance.hours_per_day,
        "days_per_month": appliance.days_per_month,
        "estimated_kwh_month": kwh,
        "estimated_cost_month": round(kwh * rate, 2),
    }


def ensure_building_exists(db: Session, building_id: int):
    building = (
        db.query(models.Building)
        .filter(models.Building.building_id == building_id)
        .first()
    )

    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    return building


@router.get("/", response_model=list[schemas.ApplianceResponse])
def get_appliances(
    building_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(models.Appliance)

    if building_id is not None:
        query = query.filter(models.Appliance.building_id == building_id)

    appliances = query.order_by(models.Appliance.appliance_id).all()
    rate = get_rate_per_kwh(db)

    return [serialize_appliance(appliance, rate) for appliance in appliances]


@router.post("/", response_model=schemas.ApplianceResponse)
def create_appliance(
    appliance: schemas.ApplianceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_manager),
):
    ensure_building_exists(db, appliance.building_id)

    new_appliance = models.Appliance(**appliance.model_dump())

    db.add(new_appliance)
    db.commit()
    db.refresh(new_appliance)

    return serialize_appliance(new_appliance, get_rate_per_kwh(db))


@router.put("/{appliance_id}", response_model=schemas.ApplianceResponse)
def update_appliance(
    appliance_id: int,
    updated_appliance: schemas.ApplianceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_manager),
):
    appliance = (
        db.query(models.Appliance)
        .filter(models.Appliance.appliance_id == appliance_id)
        .first()
    )

    if not appliance:
        raise HTTPException(status_code=404, detail="Appliance not found")

    ensure_building_exists(db, updated_appliance.building_id)

    for key, value in updated_appliance.model_dump().items():
        setattr(appliance, key, value)

    db.commit()
    db.refresh(appliance)

    return serialize_appliance(appliance, get_rate_per_kwh(db))


@router.delete("/{appliance_id}")
def delete_appliance(
    appliance_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_or_manager),
):
    appliance = (
        db.query(models.Appliance)
        .filter(models.Appliance.appliance_id == appliance_id)
        .first()
    )

    if not appliance:
        raise HTTPException(status_code=404, detail="Appliance not found")

    db.delete(appliance)
    db.commit()

    return {"message": "Appliance deleted successfully"}
