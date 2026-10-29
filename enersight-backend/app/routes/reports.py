"""Saved report snapshots.

The Reports page computes its figures in the browser from the readings it has
already loaded, and it will keep doing that - this is not a reporting engine. What
these endpoints add is a record that a report was generated: who ran it, over what,
and what it said at the time.

That record is what "audit support" needs. A report recomputed next month over the
same period can legitimately differ from the one presented today, because readings
get corrected and verified after the fact. Without a snapshot there is no way to
show what was on the screen when a decision was made.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import audit, models, schemas
from ..auth import get_current_user, require_admin_or_manager
from ..database import get_db
from ..models import User

router = APIRouter(prefix="/reports", tags=["Reports"])

# A saved report is a small row, but an unbounded list still grows without limit
# on a page that loads it on every visit.
DEFAULT_LIMIT = 50
MAX_LIMIT = 200


@router.get("/", response_model=List[schemas.ReportResponse])
def list_reports(
    building_id: Optional[int] = None,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Saved reports, newest first. Any signed-in role may read them."""
    query = db.query(models.EnergyReport)

    if building_id is not None:
        query = query.filter(models.EnergyReport.building_id == building_id)

    return (
        query.order_by(models.EnergyReport.generated_at.desc())
        .limit(limit)
        .all()
    )


@router.post("/", response_model=schemas.ReportResponse, status_code=status.HTTP_201_CREATED)
def save_report(
    payload: schemas.ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a report the user just generated.

    Open to every signed-in role: the use case has Facilities Staff generating
    reports, and saving one is the same action as running it.
    """
    if payload.building_id is not None:
        building = (
            db.query(models.Building)
            .filter(models.Building.building_id == payload.building_id)
            .first()
        )

        if not building:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="That building does not exist.",
            )

    report = models.EnergyReport(
        building_id=payload.building_id,
        # From the token, never the request body, so a snapshot cannot be
        # attributed to another user.
        user_id=current_user.user_id,
        report_type=payload.report_type,
        total_consumption=payload.total_consumption,
        average_consumption=payload.average_consumption,
        peak_consumption=payload.peak_consumption,
    )

    db.add(report)
    db.flush()

    audit.log_action(db, audit.REPORT_SAVED, current_user.user_id, f"#{report.report_id}")
    db.commit()
    db.refresh(report)

    return report


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
):
    """Remove a saved snapshot. Restricted, because deleting an audit record is
    exactly the action an audit trail exists to make visible."""
    report = (
        db.query(models.EnergyReport)
        .filter(models.EnergyReport.report_id == report_id)
        .first()
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That report does not exist.",
        )

    db.delete(report)
    audit.log_action(db, audit.REPORT_DELETED, current_user.user_id, f"#{report_id}")
    db.commit()

    return None
