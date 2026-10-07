from typing import Literal

from pydantic import BaseModel


class UserOut(BaseModel):
    user_id: int
    phone_number: str
    username: str
    display_name: str
    about: str | None
    avatar_color: str
    avatar_url: str | None
    last_seen_at: int | None
    created_at: int

    model_config = {"from_attributes": True}


class OtpStartIn(BaseModel):
    phone_number: str


class OtpVerifyIn(BaseModel):
    phone_number: str
    code: str


class RegisterIn(BaseModel):
    phone_number: str
    username: str
    display_name: str
    avatar_color: str = "A100"


class UserPatchIn(BaseModel):
    display_name: str | None = None
    about: str | None = None
    avatar_color: str | None = None


class ContactIn(BaseModel):
    phone_or_username: str
    nickname: str | None = None


class ContactOut(BaseModel):
    contact_id: int
    owner_id: int
    contact_user_id: int
    nickname: str | None
    created_at: int
    user: UserOut

    model_config = {"from_attributes": True}


class MessageIn(BaseModel):
    client_id: str
    body: str


class MessageOut(BaseModel):
    message_id: int
    conversation_id: int
    sender_id: int
    client_id: str
    body: str
    kind: str
    created_at: int
    status: str = "sent"


class ReceiptIn(BaseModel):
    message_ids: list[int]
    status: Literal["delivered", "read"]


class TypingIn(BaseModel):
    active: bool


class MemberOut(BaseModel):
    user_id: int
    role: str
    joined_at: int
    display_name: str
    username: str
    about: str | None
    avatar_color: str
    last_seen_at: int | None


class ConversationSummary(BaseModel):
    conversation_id: int
    type: str
    title: str | None
    avatar_color: str | None
    peer: UserOut | None
    last_message: MessageOut | None
    unread_count: int
    is_pinned: bool
    is_archived: bool
    is_muted: bool


class ConversationDetail(ConversationSummary):
    members: list[MemberOut]


class ConversationOut(BaseModel):
    conversation_id: int
    type: str
    title: str | None
    avatar_color: str | None
    direct_key: str | None
    created_by: int
    created_at: int

    model_config = {"from_attributes": True}


class DirectIn(BaseModel):
    user_id: int


class GroupIn(BaseModel):
    title: str
    user_ids: list[int]


class ConversationPatchIn(BaseModel):
    title: str | None = None
    is_pinned: bool | None = None
    is_archived: bool | None = None
    is_muted: bool | None = None
