from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, RootModel, model_validator

from app.core.validators import (
    AVATAR_COLORS,
    OTP_RE,
    SETTINGS_KEY_RE,
    about_text,
    normalize_phone,
    trimmed,
    trimmed_optional,
    validate_client_id,
    validate_username,
)

Phone = Annotated[str, AfterValidator(normalize_phone)]
Username = Annotated[str, AfterValidator(validate_username)]
ClientId = Annotated[str, AfterValidator(validate_client_id)]
DisplayName = Annotated[str, AfterValidator(trimmed(1, 80))]
Nickname = Annotated[str | None, AfterValidator(trimmed_optional(80))]
About = Annotated[str | None, AfterValidator(about_text)]
AvatarColor = Literal[*AVATAR_COLORS]
OtpCode = Annotated[str, Field(pattern=OTP_RE.pattern)]
MessageBody = Annotated[str, AfterValidator(trimmed(1, 4000))]
PositiveId = Annotated[int, Field(ge=1)]
IdList = Annotated[list[PositiveId], Field(min_length=1, max_length=256)]


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
    phone_number: Phone


class OtpVerifyIn(BaseModel):
    phone_number: Phone
    code: OtpCode


class RegisterIn(BaseModel):
    phone_number: Phone
    username: Username
    display_name: DisplayName
    about: About = None
    avatar_color: AvatarColor = "A100"


class UserPatchIn(BaseModel):
    display_name: DisplayName | None = None
    about: About = None
    avatar_color: AvatarColor | None = None


class ContactIn(BaseModel):
    phone_or_username: Annotated[str, Field(min_length=1, max_length=80)]
    nickname: Nickname = None


class ContactOut(BaseModel):
    contact_id: int
    owner_id: int
    contact_user_id: int
    nickname: str | None
    created_at: int
    user: UserOut

    model_config = {"from_attributes": True}


class MessageIn(BaseModel):
    client_id: ClientId
    body: MessageBody


class AttachmentOut(BaseModel):
    attachment_id: int
    file_name: str
    mime_type: str
    size_bytes: int


class MessageOut(BaseModel):
    message_id: int
    conversation_id: int
    sender_id: int
    client_id: str
    body: str
    kind: str
    created_at: int
    status: str = "sent"
    sender_name: str | None = None
    attachments: list[AttachmentOut] = []


class ReceiptIn(BaseModel):
    message_ids: Annotated[list[PositiveId], Field(min_length=1, max_length=256)]
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


class MemberRoleIn(BaseModel):
    role: Literal["admin", "member"]


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
    user_id: PositiveId


class GroupIn(BaseModel):
    title: DisplayName
    user_ids: IdList


class ConversationPatchIn(BaseModel):
    title: DisplayName | None = None
    is_pinned: bool | None = None
    is_archived: bool | None = None
    is_muted: bool | None = None


class SettingsPatchIn(RootModel[dict[str, str | int | float | bool]]):
    @model_validator(mode="after")
    def _validate(self) -> "SettingsPatchIn":
        for key, value in self.root.items():
            if not SETTINGS_KEY_RE.fullmatch(key):
                raise ValueError(f"invalid settings key: {key!r}")
            if len(str(value)) > 200:
                raise ValueError(f"settings value too long: {key!r}")
        return self

    def as_str_map(self) -> dict[str, str]:
        return {key: str(value) for key, value in self.root.items()}
