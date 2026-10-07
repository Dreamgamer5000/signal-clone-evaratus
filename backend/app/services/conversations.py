from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import now_ms
from app.models import Conversation, ConversationMember


def get_or_create_direct(db: Session, me_id: int, other_id: int) -> Conversation:
    key = f"{min(me_id, other_id)}:{max(me_id, other_id)}"
    conv = db.scalar(select(Conversation).where(Conversation.direct_key == key))
    if conv is None:
        conv = Conversation(
            type="direct",
            direct_key=key,
            created_by=me_id,
            created_at=now_ms(),
        )
        db.add(conv)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            conv = db.scalar(select(Conversation).where(Conversation.direct_key == key))
    _ensure_members(db, conv, me_id, other_id)
    return conv


def member_ids(db: Session, conversation_id: int) -> list[int]:
    return list(
        db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conversation_id
            )
        ).all()
    )


def _ensure_members(db: Session, conv: Conversation, *user_ids: int) -> None:
    existing = set(member_ids(db, conv.conversation_id))
    now = now_ms()
    added = False
    for uid in user_ids:
        if uid not in existing:
            db.add(
                ConversationMember(
                    conversation_id=conv.conversation_id,
                    user_id=uid,
                    role="member",
                    joined_at=now,
                )
            )
            added = True
    if not added:
        return
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
