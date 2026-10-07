from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import User, UserSetting
from app.schemas import SettingsPatchIn

router = APIRouter()


def _settings_map(db: Session, user_id: int) -> dict[str, str]:
    rows = db.scalars(
        select(UserSetting).where(UserSetting.user_id == user_id)
    ).all()
    return {row.key: row.value for row in rows}


@router.get("")
def get_settings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    return _settings_map(db, user.user_id)


@router.patch("")
def patch_settings(
    payload: SettingsPatchIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    existing = {
        row.key: row
        for row in db.scalars(
            select(UserSetting).where(UserSetting.user_id == user.user_id)
        ).all()
    }
    for key, value in payload.as_str_map().items():
        row = existing.get(key)
        if row is None:
            db.add(UserSetting(user_id=user.user_id, key=key, value=value))
        else:
            row.value = value
    db.commit()
    return _settings_map(db, user.user_id)
