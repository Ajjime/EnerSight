from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import audit, models, schemas
from ..auth import get_current_user, require_admin, require_admin_or_manager
from ..database import get_db
from ..models import User

router = APIRouter(
    prefix="/buildings",
    tags=["Buildings"],
)


@router.get("/", response_model=list[schemas.BuildingResponse])
def get_buildings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    buildings = db.query(models.Building).order_by(models.Building.building_id).all()
    return buildings


@router.post("/", response_model=schemas.BuildingResponse)
def create_building(
    building: schemas.BuildingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
):
    new_building = models.Building(**building.model_dump())

    db.add(new_building)
    db.flush()
    audit.log_action(
        db,
        audit.BUILDING_CREATED,
        current_user.user_id,
        f"#{new_building.building_id} {new_building.name}",
    )
    db.commit()
    db.refresh(new_building)

    return new_building


@router.get("/{building_id}", response_model=schemas.BuildingResponse)
def get_building(
    building_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    building = (
        db.query(models.Building)
        .filter(models.Building.building_id == building_id)
        .first()
    )

    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    return building


@router.put("/{building_id}", response_model=schemas.BuildingResponse)
def update_building(
    building_id: int,
    updated_building: schemas.BuildingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
):
    building = (
        db.query(models.Building)
        .filter(models.Building.building_id == building_id)
        .first()
    )

    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    for key, value in updated_building.model_dump().items():
        setattr(building, key, value)

    audit.log_action(
        db,
        audit.BUILDING_UPDATED,
        current_user.user_id,
        f"#{building.building_id} {building.name}",
    )

    db.commit()
    db.refresh(building)

    return building


@router.delete("/{building_id}")
def delete_building(
    building_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    building = (
        db.query(models.Building)
        .filter(models.Building.building_id == building_id)
        .first()
    )

    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Meters cascade with the building. Consumption history must not disappear with
    # them, so block the delete while any reading still references this building.
    linked_readings_count = (
        db.query(models.ConsumptionRecord)
        .join(models.Meter, models.ConsumptionRecord.meter_id == models.Meter.meter_id)
        .filter(models.Meter.building_id == building_id)
        .count()
    )

    if linked_readings_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot delete this building because its meters already have "
                f"{linked_readings_count} consumption reading(s). Delete those "
                "readings first, or keep the building for record history."
            ),
        )

    audit.log_action(
        db,
        audit.BUILDING_DELETED,
        current_user.user_id,
        f"#{building.building_id} {building.name}",
    )

    db.delete(building)
    db.commit()

    return {"message": "Building deleted successfully"}
