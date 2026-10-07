import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.broker import broker
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import get_current_user, now_ms
from app.models import User

router = APIRouter()


async def _event_stream(user_id: int):
    queue = broker.subscribe(user_id)
    broker.set_presence(user_id, True)
    try:
        while True:
            try:
                event_type, payload = await asyncio.wait_for(
                    queue.get(), timeout=settings.SSE_HEARTBEAT_SECONDS
                )
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
                continue
            yield (
                f"event: {event_type}\n"
                f'data: {json.dumps({"type": event_type, "payload": payload})}\n\n'
            )
    finally:
        broker.unsubscribe(user_id, queue)
        last_seen_at = now_ms()
        db: Session = SessionLocal()
        try:
            row = db.get(User, user_id)
            if row is not None:
                row.last_seen_at = last_seen_at
                db.commit()
        finally:
            db.close()
        broker.set_presence(user_id, False, last_seen_at)


@router.get("/events")
def events(user: User = Depends(get_current_user)) -> StreamingResponse:
    return StreamingResponse(
        _event_stream(user.user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
