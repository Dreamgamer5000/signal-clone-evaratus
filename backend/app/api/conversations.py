from typing import Annotated
import secrets

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user, now_ms
from app.models import Attachment, Conversation, ConversationMember, Message, MessageReceipt, User
from app.schemas import (
    AttachmentOut,
    ConversationDetail,
    ConversationOut,
    ConversationPatchIn,
    ConversationSummary,
    DirectIn,
    GroupIn,
    MemberOut,
    MessageOut,
    UserOut,
)
from app.services.conversations import get_or_create_direct
from app.services.messages import derive_status

router = APIRouter()


def _message_out(db: Session, m: Message, viewer_id: int) -> MessageOut:
    receipts = list(
        db.scalars(
            select(MessageReceipt).where(MessageReceipt.message_id == m.message_id)
        ).all()
    )
    sender = db.get(User, m.sender_id)
    attachments = [
        AttachmentOut(
            attachment_id=a.attachment_id,
            file_name=a.file_name,
            mime_type=a.mime_type,
            size_bytes=a.size_bytes,
        )
        for a in db.scalars(
            select(Attachment).where(Attachment.message_id == m.message_id)
        ).all()
    ]
    return MessageOut(
        message_id=m.message_id,
        conversation_id=m.conversation_id,
        sender_id=m.sender_id,
        client_id=m.client_id,
        body=m.body,
        kind=m.kind,
        created_at=m.created_at,
        status=derive_status(receipts, viewer_id),
        sender_name=sender.display_name if sender is not None else None,
        attachments=attachments,
    )


def _last_message(db: Session, conversation_id: int, viewer_id: int) -> MessageOut | None:
    m = db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.message_id.desc())
        .limit(1)
    )
    return _message_out(db, m, viewer_id) if m is not None else None


def _unread_count(
    db: Session, conversation_id: int, member: ConversationMember, me_id: int
) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.message_id > func.coalesce(member.last_read_message_id, 0),
            Message.sender_id != me_id,
        )
    )


def _peer(db: Session, conv: Conversation, me_id: int) -> UserOut | None:
    if conv.type != "direct":
        return None
    other_id = db.scalar(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conv.conversation_id,
            ConversationMember.user_id != me_id,
        )
    )
    if other_id is None:
        return None
    other = db.get(User, other_id)
    return UserOut.model_validate(other) if other is not None else None


def _summary(
    db: Session, conv: Conversation, member: ConversationMember, me_id: int
) -> ConversationSummary:
    return ConversationSummary(
        conversation_id=conv.conversation_id,
        type=conv.type,
        title=conv.title,
        avatar_color=conv.avatar_color,
        peer=_peer(db, conv, me_id),
        last_message=_last_message(db, conv.conversation_id, me_id),
        unread_count=_unread_count(db, conv.conversation_id, member, me_id),
        is_pinned=bool(member.is_pinned),
        is_archived=bool(member.is_archived),
        is_muted=bool(member.is_muted),
    )


def _members_out(db: Session, conversation_id: int) -> list[MemberOut]:
    rows = db.execute(
        select(ConversationMember, User)
        .join(User, User.user_id == ConversationMember.user_id)
        .where(ConversationMember.conversation_id == conversation_id)
        .order_by(ConversationMember.joined_at, ConversationMember.user_id)
    ).all()
    return [
        MemberOut(
            user_id=u.user_id,
            role=m.role,
            joined_at=m.joined_at,
            display_name=u.display_name,
            username=u.username,
            about=u.about,
            avatar_color=u.avatar_color,
            last_seen_at=u.last_seen_at,
        )
        for m, u in rows
    ]


def _require_membership(
    db: Session, conversation_id: int, me_id: int
) -> tuple[Conversation, ConversationMember]:
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(404, "conversation not found")
    member = db.get(ConversationMember, (conversation_id, me_id))
    if member is None:
        raise HTTPException(403, "not a member")
    return conv, member


@router.get("")
def list_conversations(
    archived: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConversationSummary]:
    rows = db.execute(
        select(Conversation, ConversationMember)
        .join(
            ConversationMember,
            ConversationMember.conversation_id == Conversation.conversation_id,
        )
        .where(
            ConversationMember.user_id == user.user_id,
            ConversationMember.is_archived == (1 if archived else 0),
        )
    ).all()
    summaries = [_summary(db, conv, member, user.user_id) for conv, member in rows]
    summaries.sort(
        key=lambda s: (
            not s.is_pinned,
            s.last_message is None,
            -(s.last_message.created_at if s.last_message is not None else 0),
            -s.conversation_id,
        )
    )
    return summaries


@router.post("/direct")
def create_direct(
    payload: DirectIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationOut:
    if payload.user_id == user.user_id:
        raise HTTPException(400, "cannot create a direct conversation with yourself")
    if db.get(User, payload.user_id) is None:
        raise HTTPException(404, "user not found")
    conv = get_or_create_direct(db, user.user_id, payload.user_id)
    return ConversationOut.model_validate(conv)


@router.post("/group")
def create_group(
    payload: GroupIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationOut:
    target_ids = [uid for uid in dict.fromkeys(payload.user_ids) if uid != user.user_id]
    for uid in target_ids:
        if db.get(User, uid) is None:
            raise HTTPException(404, "user not found")
    now = now_ms()
    conv = Conversation(
        type="group",
        title=payload.title,
        avatar_color="A100",
        created_by=user.user_id,
        created_at=now,
    )
    db.add(conv)
    db.flush()
    db.add(
        ConversationMember(
            conversation_id=conv.conversation_id,
            user_id=user.user_id,
            role="admin",
            joined_at=now,
        )
    )
    for uid in target_ids:
        db.add(
            ConversationMember(
                conversation_id=conv.conversation_id,
                user_id=uid,
                role="member",
                joined_at=now,
            )
        )
    db.add(
        Message(
            conversation_id=conv.conversation_id,
            sender_id=user.user_id,
            client_id=secrets.token_hex(16),
            body=f"{user.display_name} created the group",
            kind="system",
            created_at=now,
        )
    )
    db.commit()
    return ConversationOut.model_validate(conv)


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: Annotated[int, Path(ge=1)],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetail:
    conv, member = _require_membership(db, conversation_id, user.user_id)
    summary = _summary(db, conv, member, user.user_id)
    return ConversationDetail(
        **summary.model_dump(),
        members=_members_out(db, conversation_id),
    )


@router.get("/{conversation_id}/members")
def list_members(
    conversation_id: Annotated[int, Path(ge=1)],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MemberOut]:
    _require_membership(db, conversation_id, user.user_id)
    return _members_out(db, conversation_id)


@router.patch("/{conversation_id}")
def patch_conversation(
    conversation_id: Annotated[int, Path(ge=1)],
    payload: ConversationPatchIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationOut:
    conv, member = _require_membership(db, conversation_id, user.user_id)
    if payload.title is not None:
        if member.role != "admin":
            raise HTTPException(403, "only admins can change the title")
        conv.title = payload.title
    if payload.is_pinned is not None:
        member.is_pinned = 1 if payload.is_pinned else 0
    if payload.is_archived is not None:
        member.is_archived = 1 if payload.is_archived else 0
    if payload.is_muted is not None:
        member.is_muted = 1 if payload.is_muted else 0
    db.commit()
    return ConversationOut.model_validate(conv)
