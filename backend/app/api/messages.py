from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.broker import broker
from app.core.db import get_db
from app.core.security import get_current_user, now_ms
from app.models import Conversation, ConversationMember, Message, MessageReceipt, User
from app.schemas import MessageIn, MessageOut
from app.services.conversations import member_ids
from app.services.messages import add_receipt_rows, derive_status

router = APIRouter()


def _require_membership(
    db: Session, conversation_id: int, me_id: int
) -> None:
    if db.get(Conversation, conversation_id) is None:
        raise HTTPException(404, "conversation not found")
    if db.get(ConversationMember, (conversation_id, me_id)) is None:
        raise HTTPException(403, "not a member")


def _message_out(m: Message, status: str, sender_name: str | None = None) -> MessageOut:
    return MessageOut(
        message_id=m.message_id,
        conversation_id=m.conversation_id,
        sender_id=m.sender_id,
        client_id=m.client_id,
        body=m.body,
        kind=m.kind,
        created_at=m.created_at,
        status=status,
        sender_name=sender_name,
    )


def _receipts_for(
    db: Session, message_ids: list[int]
) -> dict[int, list[MessageReceipt]]:
    if not message_ids:
        return {}
    rows = db.scalars(
        select(MessageReceipt).where(MessageReceipt.message_id.in_(message_ids))
    ).all()
    out: dict[int, list[MessageReceipt]] = {}
    for r in rows:
        out.setdefault(r.message_id, []).append(r)
    return out


@router.post("/{conversation_id}/messages", response_model=MessageOut)
def send_message(
    conversation_id: int,
    payload: MessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    _require_membership(db, conversation_id, user.user_id)
    if not payload.body or len(payload.body) > 4000:
        raise HTTPException(422, "body must be 1-4000 characters")
    existing = db.scalar(
        select(Message).where(
            Message.sender_id == user.user_id,
            Message.client_id == payload.client_id,
        )
    )
    sender = db.get(User, user.user_id)
    if existing is not None:
        receipts = list(
            db.scalars(
                select(MessageReceipt).where(
                    MessageReceipt.message_id == existing.message_id
                )
            ).all()
        )
        return _message_out(
            existing, derive_status(receipts, user.user_id), sender.display_name
        )
    msg = Message(
        conversation_id=conversation_id,
        sender_id=user.user_id,
        client_id=payload.client_id,
        body=payload.body,
        kind="text",
        created_at=now_ms(),
    )
    db.add(msg)
    db.flush()
    add_receipt_rows(db, msg)
    db.commit()
    out = _message_out(msg, "sent", sender.display_name)
    broker.publish(member_ids(db, conversation_id), "message.new", out.model_dump())
    return out


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: int,
    before_id: int | None = None,
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MessageOut]:
    _require_membership(db, conversation_id, user.user_id)
    q = select(Message).where(Message.conversation_id == conversation_id)
    if before_id is not None:
        q = q.where(Message.message_id < before_id)
    rows = list(
        db.scalars(
            q.order_by(Message.created_at.desc(), Message.message_id.desc())
            .limit(limit)
        ).all()
    )[::-1]
    receipts = _receipts_for(db, [m.message_id for m in rows])
    sender_names = {
        u.user_id: u.display_name
        for u in db.scalars(select(User).where(User.user_id.in_({m.sender_id for m in rows})))
    }
    return [
        _message_out(
            m,
            derive_status(receipts.get(m.message_id, []), user.user_id),
            sender_names.get(m.sender_id),
        )
        for m in rows
    ]
