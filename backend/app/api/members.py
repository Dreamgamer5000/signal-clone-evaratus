import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, Path
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.broker import broker
from app.core.db import get_db
from app.core.security import get_current_user, now_ms
from app.models import Conversation, ConversationMember, Message, User
from app.schemas import MemberOut, MessageOut
from app.services.conversations import member_ids

router = APIRouter()


class MemberAddIn(BaseModel):
    user_id: int = Field(ge=1)


class MemberRoleIn(BaseModel):
    role: Literal["admin", "member"]


def _require_group_admin(
    db: Session, conversation_id: int, me_id: int
) -> tuple[Conversation, ConversationMember]:
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(404, "conversation not found")
    member = db.get(ConversationMember, (conversation_id, me_id))
    if member is None:
        raise HTTPException(403, "not a member")
    if conv.type != "group":
        raise HTTPException(403, "not a group")
    if member.role != "admin":
        raise HTTPException(403, "admin only")
    return conv, member


def _member_out(db: Session, conversation_id: int, user_id: int) -> MemberOut:
    member = db.get(ConversationMember, (conversation_id, user_id))
    u = db.get(User, user_id)
    return MemberOut(
        user_id=u.user_id,
        role=member.role,
        joined_at=member.joined_at,
        display_name=u.display_name,
        username=u.username,
        about=u.about,
        avatar_color=u.avatar_color,
        last_seen_at=u.last_seen_at,
    )


def _role_count(db: Session, conversation_id: int, role: str) -> int:
    return db.scalar(
        select(func.count())
        .select_from(ConversationMember)
        .where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.role == role,
        )
    )


def _member_count(db: Session, conversation_id: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(ConversationMember)
        .where(ConversationMember.conversation_id == conversation_id)
    )


def _system_message(
    db: Session, conversation_id: int, actor: User, body: str
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        sender_id=actor.user_id,
        client_id=secrets.token_hex(16),
        body=body,
        kind="system",
        created_at=now_ms(),
    )
    db.add(msg)
    db.flush()
    return msg


def _publish(db: Session, conversation_id: int, actor: User, msg: Message) -> None:
    ids = member_ids(db, conversation_id)
    broker.publish(
        ids, "conversation.updated", {"conversation_id": conversation_id, "reason": "members"}
    )
    out = MessageOut(
        message_id=msg.message_id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        client_id=msg.client_id,
        body=msg.body,
        kind=msg.kind,
        created_at=msg.created_at,
        status="sent",
        sender_name=actor.display_name,
    )
    broker.publish(ids, "message.new", out.model_dump())


@router.post("/{conversation_id}/members", response_model=MemberOut)
def add_member(
    conversation_id: Annotated[int, Path(ge=1)],
    payload: MemberAddIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemberOut:
    _require_group_admin(db, conversation_id, user.user_id)
    target = db.get(User, payload.user_id)
    if target is None:
        raise HTTPException(404, "user not found")
    if db.get(ConversationMember, (conversation_id, payload.user_id)) is not None:
        raise HTTPException(409, "already a member")
    db.add(
        ConversationMember(
            conversation_id=conversation_id,
            user_id=payload.user_id,
            role="member",
            joined_at=now_ms(),
        )
    )
    msg = _system_message(
        db,
        conversation_id,
        user,
        f"{user.display_name} added {target.display_name}",
    )
    db.commit()
    _publish(db, conversation_id, user, msg)
    return _member_out(db, conversation_id, payload.user_id)


@router.delete("/{conversation_id}/members/{user_id}", status_code=204)
def remove_member(
    conversation_id: Annotated[int, Path(ge=1)],
    user_id: Annotated[int, Path(ge=1)],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _require_group_admin(db, conversation_id, user.user_id)
    target = db.get(User, user_id)
    target_member = db.get(ConversationMember, (conversation_id, user_id))
    if target is None or target_member is None:
        raise HTTPException(404, "not a member")
    if target_member.role == "admin" and _role_count(db, conversation_id, "admin") == 1:
        raise HTTPException(409, "last admin")
    if _member_count(db, conversation_id) == 1:
        raise HTTPException(409, "last member")
    msg = _system_message(
        db,
        conversation_id,
        user,
        f"{user.display_name} removed {target.display_name}",
    )
    db.delete(target_member)
    db.commit()
    _publish(db, conversation_id, user, msg)
    return Response(status_code=204)


@router.patch("/{conversation_id}/members/{user_id}", response_model=MemberOut)
def set_member_role(
    conversation_id: Annotated[int, Path(ge=1)],
    user_id: Annotated[int, Path(ge=1)],
    payload: MemberRoleIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemberOut:
    _require_group_admin(db, conversation_id, user.user_id)
    target = db.get(User, user_id)
    target_member = db.get(ConversationMember, (conversation_id, user_id))
    if target is None or target_member is None:
        raise HTTPException(404, "not a member")
    if (
        payload.role == "member"
        and target_member.role == "admin"
        and _role_count(db, conversation_id, "admin") == 1
    ):
        raise HTTPException(409, "last admin")
    if payload.role == "admin":
        body = f"{user.display_name} made {target.display_name} an admin"
    else:
        body = f"{user.display_name} made {target.display_name} a member"
    target_member.role = payload.role
    msg = _system_message(db, conversation_id, user, body)
    db.commit()
    _publish(db, conversation_id, user, msg)
    return _member_out(db, conversation_id, user_id)
