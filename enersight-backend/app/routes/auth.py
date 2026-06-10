from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserOut


router = APIRouter(prefix="/auth", tags=["Authentication"])


class MeUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


@router.post("/login", response_model=TokenResponse)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == login_data.username).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_access_token(
        data={
            "sub": user.username,
            "role": user.role,
            "user_id": user.user_id,
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    update_data: MeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if update_data.full_name is not None:
        if not update_data.full_name.strip():
            raise HTTPException(status_code=400, detail="Full name cannot be empty")
        current_user.full_name = update_data.full_name.strip()

    if update_data.username is not None:
        if not update_data.username.strip():
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        existing = (
            db.query(User)
            .filter(
                User.username == update_data.username.strip(),
                User.user_id != current_user.user_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        current_user.username = update_data.username.strip()

    if update_data.new_password:
        if not update_data.current_password:
            raise HTTPException(status_code=400, detail="Current password is required")
        if not verify_password(update_data.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        current_user.password_hash = hash_password(update_data.new_password)

    db.commit()
    db.refresh(current_user)
    return current_user
