"""Audit trail writes.

The `access_log` table has existed since the first commit and nothing ever wrote to
it, so a panelist reading the schema would find a table that does nothing. A system
with three roles, an account approval workflow, and verify and delete actions ought
to record who did what, so this fills it in.

Deliberately best-effort: a failed audit write must never fail the action the user
was performing. A lost log line is much less bad than a lost reading.
"""

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AccessLog


logger = logging.getLogger(__name__)


# Action names. Kept as constants so the strings in the table stay consistent and
# are greppable, rather than being typed out at each call site.
LOGIN = "LOGIN"
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
