"""Input normalization and constraint helpers shared by API schemas and the seed."""

import re

PHONE_SEPARATORS = re.compile(r"[\s\-().]")
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$")
US_E164_RE = re.compile(r"^\+1\d{10}$")
OTP_RE = re.compile(r"^\d{6}$")
CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,64}$")
SETTINGS_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
AVATAR_COLORS = (
    "A100", "A110", "A120", "A130", "A140", "A150",
    "A160", "A170", "A180", "A190", "A200", "A210",
)


def normalize_phone(raw: str) -> str:
    """Strip separators and normalize to `+1` + 10 digits (US E.164).

    Accepts `5550000001`, `15550000001`, `+1 555-000-0001`, `+1 (555) 000-0001`.
    """
    digits = PHONE_SEPARATORS.sub("", (raw or "").strip())
    if digits.startswith("+"):
        digits = digits[1:]
    if re.fullmatch(r"\d{10}", digits):
        digits = "1" + digits
    if not re.fullmatch(r"1\d{10}", digits):
        raise ValueError("phone number must be 10 digits, optionally with +1 country code")
    return "+" + digits


def validate_username(raw: str) -> str:
    """Lowercase, trimmed Signal-style username: 3-32 chars, starts and ends alphanumeric."""
    value = (raw or "").strip().lower()
    if not USERNAME_RE.fullmatch(value):
        raise ValueError(
            "username must be 3-32 characters: lowercase letters, digits, dots, underscores, hyphens"
        )
    return value


def validate_client_id(raw: str) -> str:
    value = (raw or "").strip()
    if not CLIENT_ID_RE.fullmatch(value):
        raise ValueError("client_id must be 8-64 characters of letters, digits, . _ : -")
    return value


def trimmed(min_len: int, max_len: int):
    """AfterValidator factory: strip outer whitespace, enforce length."""

    def _check(raw: str) -> str:
        value = (raw or "").strip()
        if not min_len <= len(value) <= max_len:
            raise ValueError(f"must be {min_len}-{max_len} characters")
        return value

    return _check


def trimmed_optional(max_len: int):
    """AfterValidator factory: None passes; strings stripped, 1-max_len."""

    def _check(raw: str | None) -> str | None:
        if raw is None:
            return None
        value = raw.strip()
        if not 1 <= len(value) <= max_len:
            raise ValueError(f"must be 1-{max_len} characters")
        return value

    return _check


def about_text(raw: str | None) -> str | None:
    """About blurb: optional, stripped, empty becomes None, max 200 chars."""
    if raw is None:
        return None
    value = raw.strip()
    if len(value) > 200:
        raise ValueError("must be at most 200 characters")
    return value or None


REACTION_EMOJI = (
    "👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🙏",
    "👀", "💯", "🔥", "✅", "👏", "😊", "🤔", "😴",
    "🥳", "😎", "🤝", "👋", "🫡", "💪", "🎯", "🚀",
    "☕", "🍕", "🌟", "😭", "🤗", "😅", "🙃", "🫶",
)


def validate_emoji(raw: str) -> str:
    """Reaction emoji must be an exact member of the 32-emoji allow-list."""
    if raw not in REACTION_EMOJI:
        raise ValueError("emoji must be one of the allowed reactions")
    return raw


ALLOWED_ATTACHMENT_MIMES = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "video/mp4",
    "audio/mpeg",
    "application/pdf",
    "text/plain",
    "application/zip",
}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


def safe_file_name(raw: str | None) -> str:
    """Sanitize an original file name: strip path separators and control chars,
    collapse whitespace runs, cap at 120 chars."""
    value = raw or ""
    value = value.replace("/", "").replace("\\", "")
    value = "".join(ch for ch in value if " " <= ch != "\x7f")
    value = re.sub(r"\s+", " ", value).strip()
    value = value[:120].strip()
    return value or "file"
