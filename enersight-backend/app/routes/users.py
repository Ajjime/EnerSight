from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import audit
from app.auth import hash_password, require_admin, validate_password
from app.database import get_db
from app.models import AccessLog, User
from app.schemas import UserCreate, UserOut


router = APIRouter(prefix="/users", tags=["Users"])


VALID_ROLES = ["Admin", "Manager", "Staff"]
VALID_STATUSES = ["Pending", "Active", "Inactive", "Rejected"]


def count_other_active_admins(db: Session, exclude_user_id: int) -> int:
    """Active Admins other than this one.

    Used to stop the system being locked out. Nothing previously prevented the only
    Admin from deleting themselves, demoting themselves, or deactivating their own
    account, any of which leaves no one able to administer the system.
    """
    return (
        db.query(User)
        .filter(
            User.role == "Admin",
            User.status == "Active",
            User.user_id != exclude_user_id,
        )
        .count()
    )


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


@router.post("/", response_model=UserOut)
def create_user(user_data: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.username == user_data.username).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    if user_data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    if user_data.role == "Admin":
        raise HTTPException(
            status_code=400,
            detail="Admin accounts must be created or activated by the system owner.",
        )

    new_user = User(
        full_name=user_data.full_name,
        username=user_data.username,
        password_hash=hash_password(validate_password(user_data.password)),
        role=user_data.role,
        status="Pending",
    )

    db.add(new_user)
    db.flush()
    audit.log_action(
        db, audit.USER_CREATED, new_user.user_id, f"self-registered as {new_user.role}"
    )
    db.commit()
    db.refresh(new_user)

    return new_user


@router.get("/", response_model=list[UserOut])
def get_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(User.user_id.asc()).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Refuse any edit that would leave the system with no active Admin.
    would_lose_admin = user.role == "Admin" and user.status == "Active" and (
        (user_data.role is not None and user_data.role != "Admin")
        or (user_data.status is not None and user_data.status != "Active")
    )

    if would_lose_admin and count_other_active_admins(db, user.user_id) == 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "This is the only active Admin account. Promote another user to "
                "Admin first, otherwise no one will be able to administer the system."
            ),
        )

    if user_data.full_name is not None:
        if not user_data.full_name.strip():
            raise HTTPException(status_code=400, detail="Full name cannot be empty")

        user.full_name = user_data.full_name.strip()

    if user_data.username is not None:
        if not user_data.username.strip():
            raise HTTPException(status_code=400, detail="Username cannot be empty")

        existing_user = (
            db.query(User)
            .filter(User.username == user_data.username.strip())
            .filter(User.user_id != user_id)
            .first()
        )

        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")

        user.username = user_data.username.strip()

    if user_data.password is not None and user_data.password.strip():
        user.password_hash = hash_password(validate_password(user_data.password))

    if user_data.role is not None:
        if user_data.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")

        user.role = user_data.role

    if user_data.status is not None:
        if user_data.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")

        user.status = user_data.status

    audit.log_action(
        db,
        audit.USER_UPDATED,
        current_user.user_id,
        f"#{user.user_id} {user.username} role={user.role} status={user.status}",
    )

    db.commit()
    db.refresh(user)

    return user


@router.put("/{user_id}/approve", response_model=UserOut)
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = "Active"

    audit.log_action(
        db, audit.USER_APPROVED, current_user.user_id, f"#{user.user_id} {user.username}"
    )

    db.commit()
    db.refresh(user)

    return user


@router.put("/{user_id}/reject", response_model=UserOut)
def reject_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = "Rejected"

    audit.log_action(
        db, audit.USER_REJECTED, current_user.user_id, f"#{user.user_id} {user.username}"
    )

    db.commit()
    db.refresh(user)

    return user


@router.put("/{user_id}/pending", response_model=UserOut)
def set_user_pending(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = "Pending"

    audit.log_action(
        db, audit.USER_SET_PENDING, current_user.user_id, f"#{user.user_id} {user.username}"
    )

    db.commit()
    db.refresh(user)

    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.user_id == current_user.user_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "You cannot delete your own account. Ask another Admin to do it "
                "if the account really should be removed."
            ),
        )

    if (
        user.role == "Admin"
        and user.status == "Active"
        and count_other_active_admins(db, user.user_id) == 0
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "This is the only active Admin account and cannot be deleted. "
                "Promote another user to Admin first."
            ),
        )

    audit.log_action(
        db,
        audit.USER_DELETED,
        current_user.user_id,
        f"#{user.user_id} {user.username} ({user.role})",
    )

    # Detach this user's audit history rather than letting the delete fail. AccessLog
    # has no ORM relationship on User, so SQLAlchemy will not nullify the foreign key
    # for us and Postgres would reject the delete. The entries themselves are kept:
    # the actions did happen, even though the account is gone.
    db.query(AccessLog).filter(AccessLog.user_id == user.user_id).update(
        {AccessLog.user_id: None}, synchronize_session=False
    )

    db.delete(user)
    db.commit()

    return {"message": "User deleted successfully"}