import json
from pathlib import Path as FsPath
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app.broker import broker
from app.core.config import settings
from app.core.db import get_db
from app.core.security import get_current_user, now_ms
from app.core.validators import (
    ALLOWED_ATTACHMENT_MIMES,
    MAX_ATTACHMENT_BYTES,
    safe_file_name,
    validate_client_id,
)
from app.models import Attachment, Conversation, ConversationMember, Message, MessageReceipt, User
from app.schemas import AttachmentOut, MessageIn, MessageOut
from app.services.conversations import member_ids
from app.services.messages import add_receipt_rows, derive_status

router = APIRouter()

ATTACHMENT_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mpeg",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "application/zip": ".zip",
}
CHUNK_SIZE = 1024 * 1024


def _require_membership(
    db: Session, conversation_id: int, me_id: int
) -> None:
    if db.get(Conversation, conversation_id) is None:
        raise HTTPException(404, "conversation not found")
    if db.get(ConversationMember, (conversation_id, me_id)) is None:
        raise HTTPException(403, "not a member")


def _attachment_out(a: Attachment) -> AttachmentOut:
    return AttachmentOut(
        attachment_id=a.attachment_id,
        file_name=a.file_name,
        mime_type=a.mime_type,
        size_bytes=a.size_bytes,
    )


def _attachments_for(
    db: Session, message_ids: list[int]
) -> dict[int, list[AttachmentOut]]:
    if not message_ids:
        return {}
    rows = db.scalars(
        select(Attachment).where(Attachment.message_id.in_(message_ids))
    ).all()
    out: dict[int, list[AttachmentOut]] = {}
    for a in rows:
        out.setdefault(a.message_id, []).append(_attachment_out(a))
    return out


def _message_out(
    m: Message,
    status: str,
    sender_name: str | None = None,
    attachments: list[AttachmentOut] | None = None,
) -> MessageOut:
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
        attachments=attachments or [],
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
async def send_message(
    conversation_id: Annotated[int, Path(ge=1)],
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    content_type = request.headers.get("content-type", "")
    file: UploadFile | None = None
    if content_type.startswith("multipart/form-data") or content_type.startswith(
        "application/x-www-form-urlencoded"
    ):
        form = await request.form()
        try:
            client_id = validate_client_id(str(form.get("client_id") or ""))
        except ValueError as e:
            raise HTTPException(422, str(e))
        body = str(form.get("body") or "").strip()
        if body and len(body) > 4000:
            raise HTTPException(422, "body must be 1-4000 characters")
        raw_file = form.get("file")
        if raw_file is not None and not isinstance(raw_file, UploadFile):
            raise HTTPException(422, "file must be an uploaded file")
        file = raw_file
        if file is None and not body:
            raise HTTPException(422, "body or file required")
        if file is not None and file.content_type not in ALLOWED_ATTACHMENT_MIMES:
            raise HTTPException(415, "unsupported media type")
    else:
        try:
            raw = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise RequestValidationError(
                [
                    {
                        "type": "json_invalid",
                        "loc": ("body",),
                        "msg": "JSON decode error",
                        "input": {},
                    }
                ]
            ) from e
        try:
            payload = MessageIn.model_validate(raw)
        except ValidationError as e:
            raise RequestValidationError(e.errors()) from e
        client_id = payload.client_id
        body = payload.body
        if not body or len(body) > 4000:
            raise HTTPException(422, "body must be 1-4000 characters")
    _require_membership(db, conversation_id, user.user_id)
    existing = db.scalar(
        select(Message).where(
            Message.sender_id == user.user_id,
            Message.client_id == client_id,
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
            existing,
            derive_status(receipts, user.user_id),
            sender.display_name,
            _attachments_for(db, [existing.message_id]).get(existing.message_id, []),
        )
    size = 0
    rel = ""
    if file is not None:
        ext = ATTACHMENT_EXT.get(file.content_type or "", "")
        upload_root = FsPath(settings.UPLOADS_DIR)
        rel = f"{user.user_id}/{uuid4().hex}{ext}"
        dest = upload_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            with dest.open("wb") as out:
                while chunk := await file.read(CHUNK_SIZE):
                    size += len(chunk)
                    if size > MAX_ATTACHMENT_BYTES:
                        raise HTTPException(413, "file too large")
                    out.write(chunk)
            if size == 0:
                raise HTTPException(422, "file is empty")
        except HTTPException:
            dest.unlink(missing_ok=True)
            raise
    msg = Message(
        conversation_id=conversation_id,
        sender_id=user.user_id,
        client_id=client_id,
        body=body,
        kind="text",
        created_at=now_ms(),
    )
    db.add(msg)
    db.flush()
    atts: list[AttachmentOut] = []
    if file is not None:
        att = Attachment(
            message_id=msg.message_id,
            user_id=user.user_id,
            file_name=safe_file_name(file.filename),
            mime_type=file.content_type or "",
            size_bytes=size,
            storage_path=rel,
            created_at=now_ms(),
        )
        db.add(att)
        db.flush()
        atts.append(_attachment_out(att))
    add_receipt_rows(db, msg)
    db.commit()
    out = _message_out(msg, "sent", sender.display_name, atts)
    broker.publish(member_ids(db, conversation_id), "message.new", out.model_dump())
    return out


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: Annotated[int, Path(ge=1)],
    before_id: int | None = Query(None, ge=1),
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
    attachments = _attachments_for(db, [m.message_id for m in rows])
    sender_names = {
        u.user_id: u.display_name
        for u in db.scalars(select(User).where(User.user_id.in_({m.sender_id for m in rows})))
    }
    return [
        _message_out(
            m,
            derive_status(receipts.get(m.message_id, []), user.user_id),
            sender_names.get(m.sender_id),
            attachments.get(m.message_id, []),
        )
        for m in rows
    ]
