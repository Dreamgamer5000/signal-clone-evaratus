from sqlalchemy.orm import Session

from app.models import Message, MessageReceipt
from app.schemas import ReplyPreview
from app.services.conversations import member_ids


def reply_preview(m: Message) -> ReplyPreview | None:
    if m.reply_to_body is None:
        return None
    return ReplyPreview(
        message_id=m.reply_to_message_id,
        sender_name=m.reply_to_sender_name,
        body=m.reply_to_body,
        deleted=m.reply_to_message_id is None,
    )


def derive_status(receipts: list[MessageReceipt], viewer_id: int) -> str:
    rows = [r for r in receipts if r.user_id != viewer_id]
    if any(r.read_at is not None for r in rows):
        return "read"
    if any(r.delivered_at is not None for r in rows):
        return "delivered"
    return "sent"


def add_receipt_rows(db: Session, message: Message) -> None:
    for uid in member_ids(db, message.conversation_id):
        if uid == message.sender_id:
            continue
        db.add(MessageReceipt(message_id=message.message_id, user_id=uid))
