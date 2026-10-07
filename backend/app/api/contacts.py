from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Response, Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user, now_ms
from app.core.validators import normalize_phone
from app.models import Contact, User
from app.schemas import ContactIn, ContactOut, UserOut

router = APIRouter()


def _contact_out(contact: Contact, target: User) -> ContactOut:
    return ContactOut(
        contact_id=contact.contact_id,
        owner_id=contact.owner_id,
        contact_user_id=contact.contact_user_id,
        nickname=contact.nickname,
        created_at=contact.created_at,
        user=UserOut.model_validate(target),
    )


@router.get("")
def list_contacts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ContactOut]:
    rows = db.execute(
        select(Contact, User)
        .join(User, User.user_id == Contact.contact_user_id)
        .where(Contact.owner_id == user.user_id)
        .order_by(Contact.contact_id)
    ).all()
    return [_contact_out(contact, target) for contact, target in rows]


@router.post("", status_code=200)
def add_contact(
    payload: ContactIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContactOut:
    query = payload.phone_or_username.strip()
    try:
        query = normalize_phone(query)
    except ValueError:
        query = query.lower()
    target = db.scalar(select(User).where(User.phone_number == query))
    if target is None:
        target = db.scalar(select(User).where(User.username == query))
    if target is None:
        raise HTTPException(404, "user not found")
    if target.user_id == user.user_id:
        raise HTTPException(400, "cannot add yourself as a contact")
    duplicate = db.scalar(
        select(Contact).where(
            Contact.owner_id == user.user_id,
            Contact.contact_user_id == target.user_id,
        )
    )
    if duplicate is not None:
        raise HTTPException(409, "contact already exists")
    contact = Contact(
        owner_id=user.user_id,
        contact_user_id=target.user_id,
        nickname=payload.nickname,
        created_at=now_ms(),
    )
    db.add(contact)
    db.commit()
    return _contact_out(contact, target)


@router.delete("/{contact_id}", status_code=204)
def delete_contact(
    contact_id: Annotated[int, Path(ge=1)],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    contact = db.scalar(
        select(Contact).where(
            Contact.contact_id == contact_id,
            Contact.owner_id == user.user_id,
        )
    )
    if contact is None:
        raise HTTPException(404, "contact not found")
    db.delete(contact)
    db.commit()
    return Response(status_code=204)
