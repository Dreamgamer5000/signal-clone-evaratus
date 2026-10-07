from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import User
from app.schemas import UserOut, UserPatchIn

router = APIRouter()


@router.get("")
def search_users(
    q: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    pattern = f"%{q}%"
    rows = db.scalars(
        select(User)
        .where(User.user_id != user.user_id)
        .where(or_(User.username.ilike(pattern), User.display_name.ilike(pattern)))
        .limit(20)
    ).all()
    return [UserOut.model_validate(u) for u in rows]


@router.patch("/me")
def patch_me(
    payload: UserPatchIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    return UserOut.model_validate(user)
