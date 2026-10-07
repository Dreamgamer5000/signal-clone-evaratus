from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import (
    create_session,
    get_current_user,
    now_ms,
    revoke_session,
)
from app.models import User
from app.schemas import OtpStartIn, OtpVerifyIn, RegisterIn, UserOut

router = APIRouter()


def set_session_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=raw,
        max_age=settings.SESSION_TTL_DAYS * 86400,
        path="/",
        httponly=True,
        samesite="lax",
    )


@router.post("/otp/start")
def otp_start(payload: OtpStartIn) -> dict:
    return {"otp_sent": True}


@router.post("/otp/verify")
def otp_verify(payload: OtpVerifyIn, response: Response, db: Session = Depends(get_db)) -> dict:
    if payload.code != settings.OTP_CODE:
        raise HTTPException(401, "Invalid code")
    user = db.scalar(select(User).where(User.phone_number == payload.phone_number))
    if user is None:
        raise HTTPException(428, "needs_registration")
    raw = create_session(db, user.user_id)
    set_session_cookie(response, raw)
    return {"user": UserOut.model_validate(user)}


@router.post("/register")
def register(payload: RegisterIn, response: Response, db: Session = Depends(get_db)) -> dict:
    if db.scalar(select(User).where(User.phone_number == payload.phone_number)):
        raise HTTPException(409, "phone_number already registered")
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(409, "username already taken")
    user = User(
        phone_number=payload.phone_number,
        username=payload.username,
        display_name=payload.display_name,
        avatar_color=payload.avatar_color,
        created_at=now_ms(),
    )
    db.add(user)
    db.commit()
    raw = create_session(db, user.user_id)
    set_session_cookie(response, raw)
    return {"user": UserOut.model_validate(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return {"user": UserOut.model_validate(user)}


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    raw = request.cookies.get(settings.COOKIE_NAME)
    if raw:
        revoke_session(db, raw)
    resp = Response(status_code=204)
    resp.delete_cookie(settings.COOKIE_NAME, path="/")
    return resp
