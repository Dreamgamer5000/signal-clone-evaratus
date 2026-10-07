from pathlib import Path as FsPath
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Attachment, Conversation, ConversationMember, Message, User

router = APIRouter()


@router.get("/{attachment_id}/file", response_class=FileResponse)
def get_attachment_file(
    attachment_id: Annotated[int, Path(ge=1)],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    att = db.get(Attachment, attachment_id)
    if att is None:
        raise HTTPException(404, "attachment not found")
    msg = db.get(Message, att.message_id)
    conv = db.get(Conversation, msg.conversation_id) if msg is not None else None
    if conv is None:
        raise HTTPException(404, "attachment not found")
    if db.get(ConversationMember, (conv.conversation_id, user.user_id)) is None:
        raise HTTPException(403, "not a member")
    dest = FsPath(settings.UPLOADS_DIR) / att.storage_path
    if not dest.is_file():
        raise HTTPException(404, "attachment not found")
    return FileResponse(dest, media_type=att.mime_type, filename=att.file_name)
