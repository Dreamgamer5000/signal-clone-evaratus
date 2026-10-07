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
