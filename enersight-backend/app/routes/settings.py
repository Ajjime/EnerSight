from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import audit, models, schemas
from ..auth import get_current_user, require_admin_or_manager
from ..database import get_db
from ..models import User

router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
)

RATE_KEY = "rate_per_kwh"
DEFAULT_RATE_PER_KWH = 12.0


def get_rate_per_kwh(db: Session) -> float:
    """Returns the configured electricity rate (PHP per kWh),
    falling back to a sensible default when none is saved yet."""
    setting = (
        db.query(models.Setting)
        .filter(models.Setting.key == RATE_KEY)
        .first()
    )

    if not setting:
        return DEFAULT_RATE_PER_KWH

    try:
        return float(setting.value)
    except (TypeError, ValueError):
        return DEFAULT_RATE_PER_KWH


@router.get("/rate", response_model=schemas.RateResponse)
def read_rate(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return {"rate_per_kwh": get_rate_per_kwh(db)}


@router.put("/rate", response_model=schemas.RateResponse)
def update_rate(
    payload: schemas.RateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
):
    if payload.rate_per_kwh < 0:
        raise HTTPException(status_code=400, detail="Rate cannot be negative.")

    setting = (
        db.query(models.Setting)
        .filter(models.Setting.key == RATE_KEY)
        .first()
    )

    if setting:
        setting.value = str(payload.rate_per_kwh)
    else:
        setting = models.Setting(key=RATE_KEY, value=str(payload.rate_per_kwh))
        db.add(setting)

    audit.log_action(
        db,
        audit.RATE_UPDATED,
        current_user.user_id,
        f"{payload.rate_per_kwh} PHP/kWh",
    )

    db.commit()

    return {"rate_per_kwh": payload.rate_per_kwh}
