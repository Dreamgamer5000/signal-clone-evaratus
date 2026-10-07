import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models import Session as SessionRow, User


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def new_token() -> str:
    return secrets.token_hex(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_session(db: Session, user_id: int) -> str:
    raw = new_token()
    ttl = timedelta(days=settings.SESSION_TTL_DAYS)
    db.add(SessionRow(
        session_id=hash_token(raw), user_id=user_id,
        created_at=now_ms(), expires_at=now_ms() + int(ttl.total_seconds() * 1000),
    ))
    db.commit()
    return raw


def revoke_session(db: Session, raw: str) -> None:
    row = db.get(SessionRow, hash_token(raw))
    if row:
        row.revoked_at = now_ms()
        db.commit()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw = request.cookies.get(settings.COOKIE_NAME)
    if not raw:
        raise HTTPException(401, "Not authenticated")
    row = db.get(SessionRow, hash_token(raw))
    if row is None or row.revoked_at is not None or row.expires_at < now_ms():
        raise HTTPException(401, "Invalid session")
    return db.get(User, row.user_id)
