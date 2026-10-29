"""Audit trail writes.

The `access_log` table has existed since the first commit and nothing ever wrote to
it, so a panelist reading the schema would find a table that does nothing. A system
with three roles, an account approval workflow, and verify and delete actions ought
to record who did what, so this fills it in.

Deliberately best-effort: a failed audit write must never fail the action the user
was performing. A lost log line is much less bad than a lost reading.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AccessLog


logger = logging.getLogger(__name__)


# Action names. Kept as constants so the strings in the table stay consistent and
# are greppable, rather than being typed out at each call site.
LOGIN = "LOGIN"
LOGIN_FAILED = "LOGIN_FAILED"
LOGIN_BLOCKED = "LOGIN_BLOCKED"

USER_CREATED = "USER_CREATED"
USER_UPDATED = "USER_UPDATED"
USER_APPROVED = "USER_APPROVED"
USER_REJECTED = "USER_REJECTED"
USER_SET_PENDING = "USER_SET_PENDING"
USER_DELETED = "USER_DELETED"

BUILDING_CREATED = "BUILDING_CREATED"
BUILDING_UPDATED = "BUILDING_UPDATED"
BUILDING_DELETED = "BUILDING_DELETED"

METER_CREATED = "METER_CREATED"
METER_UPDATED = "METER_UPDATED"
METER_DELETED = "METER_DELETED"

READING_CREATED = "READING_CREATED"
READING_UPDATED = "READING_UPDATED"
READING_VERIFIED = "READING_VERIFIED"
READING_UNVERIFIED = "READING_UNVERIFIED"
READING_DELETED = "READING_DELETED"

REPORT_SAVED = "REPORT_SAVED"
REPORT_DELETED = "REPORT_DELETED"

RATE_UPDATED = "RATE_UPDATED"


def log_action(
    db: Session,
    action: str,
    user_id: Optional[int] = None,
    detail: Optional[str] = None,
) -> None:
    """Record one action against the signed-in user.

    `detail` is appended to the action name because the table has no separate
    column for it: "READING_VERIFIED #42" rather than a bare action name, so the
    log says which record was touched.

    Call this *before* the surrounding route commits, so the log entry and the
    change it describes land in the same transaction.
    """
    action_type = f"{action} {detail}".strip() if detail else action

    try:
        db.add(AccessLog(user_id=user_id, action_type=action_type[:255]))
    except Exception as exc:  # noqa: BLE001 - auditing must not break the request
        logger.warning("Could not write audit entry %r: %s", action_type, exc)


def count_failed_logins(db: Session, user_id: int, within_minutes: int) -> int:
    """Failed sign-ins for one account inside the lockout window.

    Counted from the later of "the window opened" and "this account last signed in
    successfully", so a correct password clears the slate without anything having
    to delete audit rows. The log stays a record of what happened rather than a
    counter that gets reset.

    Reading the attempts back out of access_log is also why lockout needs no new
    column on `users`, and so no migration for an existing database.
    """
    window_start = datetime.utcnow() - timedelta(minutes=within_minutes)

    last_success = (
        db.query(AccessLog.log_datetime)
        .filter(AccessLog.user_id == user_id, AccessLog.action_type == LOGIN)
        .order_by(AccessLog.log_datetime.desc())
        .first()
    )

    if last_success and last_success[0] and last_success[0] > window_start:
        window_start = last_success[0]

    return (
        db.query(AccessLog)
        .filter(
            AccessLog.user_id == user_id,
            AccessLog.action_type == LOGIN_FAILED,
            AccessLog.log_datetime > window_start,
        )
        .count()
    )
