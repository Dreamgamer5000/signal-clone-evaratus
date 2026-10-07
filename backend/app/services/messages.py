from sqlalchemy.orm import Session

from app.models import Message, MessageReceipt
from app.services.conversations import member_ids


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
