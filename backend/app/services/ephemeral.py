from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.broker import broker
from app.core.security import now_ms
from app.models import Conversation, Message
from app.services.conversations import member_ids


def sweep_once(db: Session) -> int:
    now = now_ms()
    rows = db.execute(
        select(Message.message_id, Message.conversation_id)
        .join(Conversation, Conversation.conversation_id == Message.conversation_id)
        .where(
            Conversation.disappearing_seconds.is_not(None),
            Message.created_at < now - Conversation.disappearing_seconds * 1000,
        )
    ).all()
    if not rows:
        return 0
    by_conv: dict[int, list[int]] = {}
    for message_id, conversation_id in rows:
        by_conv.setdefault(conversation_id, []).append(message_id)
    deleted = 0
    for message_ids in by_conv.values():
        db.execute(delete(Message).where(Message.message_id.in_(message_ids)))
        deleted += len(message_ids)
    db.commit()
    for conversation_id in by_conv:
        broker.publish(
            member_ids(db, conversation_id),
            "conversation.updated",
            {"conversation_id": conversation_id, "reason": "ephemeral"},
        )
    return deleted
