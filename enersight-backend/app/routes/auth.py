from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import audit
from app.auth import (
    LOGIN_LOCKOUT_ATTEMPTS,
    LOGIN_LOCKOUT_MINUTES,
    create_access_token,
    get_current_user,
    hash_password,
    validate_password,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserOut


router = APIRouter(prefix="/auth", tags=["Authentication"])


# Shown after the password has already been verified, so these never leak whether
# an account exists to someone who cannot authenticate as it.
INACTIVE_STATUS_MESSAGES = {
    "Pending": (
        "Your account is still waiting for administrator approval. "
        "Please try again once it has been approved."
    ),
    "Rejected": (
        "This account request was declined. "
        "Please contact your administrator if you think this is a mistake."
    ),
    "Inactive": (
        "This account has been deactivated. Please contact your administrator."
    ),
}


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

    # Checked before the password, so a locked account cannot be probed by how
    # long a guess takes to come back. This does tell someone who has already
    # guessed five times that the username is real - that is inherent to telling
    # a locked-out user why they are locked out, and the alternative is a real
    # user with no idea why their correct password stopped working.
    failed_attempts = audit.count_failed_logins(
        db, user.user_id, LOGIN_LOCKOUT_MINUTES
    )

    if failed_attempts >= LOGIN_LOCKOUT_ATTEMPTS:
        audit.log_action(db, audit.LOGIN_BLOCKED, user.user_id)
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Too many failed sign-in attempts. Wait {LOGIN_LOCKOUT_MINUTES} "
                "minutes and try again, or ask an administrator to reset your "
                "password."
            ),
        )

    if not verify_password(login_data.password, user.password_hash):
        audit.log_action(db, audit.LOGIN_FAILED, user.user_id)
        db.commit()

        attempts_left = LOGIN_LOCKOUT_ATTEMPTS - failed_attempts - 1
        warning = (
            f" {attempts_left} attempt{'' if attempts_left == 1 else 's'} left "
            "before this account is locked."
            if 0 < attempts_left <= 2
            else ""
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid username or password.{warning}",
        )

    # Without this the login succeeds and issues a token, then every subsequent
    # request 401s in get_current_user, leaving the user "signed in" to a broken app.
    if user.status != "Active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=INACTIVE_STATUS_MESSAGES.get(
                user.status,
                "This account is not active. Please contact your administrator.",
            ),
        )

    audit.log_action(db, audit.LOGIN, user.user_id)
    db.commit()

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

        new_password = validate_password(update_data.new_password)

        if verify_password(new_password, current_user.password_hash):
            raise HTTPException(
                status_code=400,
                detail="The new password must be different from the current one.",
            )

        current_user.password_hash = hash_password(new_password)

    db.commit()
    db.refresh(current_user)
    return current_user
