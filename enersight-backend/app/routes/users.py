from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import hash_password, require_admin
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserOut


router = APIRouter(prefix="/users", tags=["Users"])


VALID_ROLES = ["Admin", "Manager", "Staff"]
VALID_STATUSES = ["Pending", "Active", "Inactive", "Rejected"]


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
        password_hash=hash_password(user_data.password),
        role=user_data.role,
        status="Pending",
    )

    db.add(new_user)
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
def update_user(user_id: int, user_data: UserUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

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
        user.password_hash = hash_password(user_data.password.strip())

    if user_data.role is not None:
        if user_data.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")

        user.role = user_data.role

    if user_data.status is not None:
        if user_data.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")

        user.status = user_data.status

    db.commit()
    db.refresh(user)

    return user


@router.put("/{user_id}/approve", response_model=UserOut)
def approve_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = "Active"

    db.commit()
    db.refresh(user)

    return user


@router.put("/{user_id}/reject", response_model=UserOut)
def reject_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = "Rejected"

    db.commit()
    db.refresh(user)

    return user


@router.put("/{user_id}/pending", response_model=UserOut)
def set_user_pending(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = "Pending"

    db.commit()
    db.refresh(user)

    return user


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()

    return {"message": "User deleted successfully"}