from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Response, Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.broker import broker
from app.core.db import get_db
from app.core.security import get_current_user, now_ms
from app.models import Conversation, ConversationMember, Message, MessageReceipt, User
from app.schemas import ReceiptIn, TypingIn
from app.services.conversations import member_ids

router = APIRouter()


def _require_membership(db: Session, conversation_id: int, me_id: int) -> None:
    if db.get(Conversation, conversation_id) is None:
        raise HTTPException(404, "conversation not found")
    if db.get(ConversationMember, (conversation_id, me_id)) is None:
        raise HTTPException(403, "not a member")


def _others(db: Session, conversation_id: int, me_id: int) -> list[int]:
    return [uid for uid in member_ids(db, conversation_id) if uid != me_id]


@router.post("/{conversation_id}/receipts", status_code=204)
def post_receipts(
    conversation_id: Annotated[int, Path(ge=1)],
    payload: ReceiptIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _require_membership(db, conversation_id, user.user_id)
    rows = list(
        db.scalars(
            select(Message).where(
                Message.conversation_id == conversation_id,
                Message.message_id.in_(payload.message_ids),
                Message.sender_id != user.user_id,
            )
        ).all()
    )
    now = now_ms()
    marked: list[int] = []
    for m in rows:
        receipt = db.get(MessageReceipt, (m.message_id, user.user_id))
        if receipt is None:
            receipt = MessageReceipt(message_id=m.message_id, user_id=user.user_id)
            db.add(receipt)
        if receipt.delivered_at is None:
            receipt.delivered_at = now
        if payload.status == "read" and receipt.read_at is None:
            receipt.read_at = now
        marked.append(m.message_id)
    marked.sort()
    if payload.status == "read" and marked:
        member = db.get(ConversationMember, (conversation_id, user.user_id))
        if member.last_read_message_id is None or member.last_read_message_id < marked[-1]:
            member.last_read_message_id = marked[-1]
    db.commit()
    broker.publish(
        member_ids(db, conversation_id),
        "message.status",
        {
            "conversation_id": conversation_id,
            "message_ids": marked,
            "user_id": user.user_id,
            "status": payload.status,
        },
    )
    return Response(status_code=204)


@router.post("/{conversation_id}/typing", status_code=204)
def post_typing(
    conversation_id: Annotated[int, Path(ge=1)],
    payload: TypingIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _require_membership(db, conversation_id, user.user_id)
    broker.publish(
        _others(db, conversation_id, user.user_id),
        "typing.update",
        {
            "conversation_id": conversation_id,
            "user_id": user.user_id,
            "active": payload.active,
        },
    )
    return Response(status_code=204)
