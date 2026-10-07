import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from app.api.attachments import router as attachments_router
from app.api.auth import router as auth_router
from app.api.contacts import router as contacts_router
from app.api.conversations import router as conversations_router
from app.api.events import router as events_router
from app.api.members import router as members_router
from app.api.messages import router as messages_router
from app.api.receipts import router as receipts_router
from app.api.settings import router as settings_router
from app.api.users import router as users_router
from app.core.db import SessionLocal, init_db
from app.services.ephemeral import sweep_once


def _sweep() -> None:
    db = SessionLocal()
    try:
        sweep_once(db)
    finally:
        db.close()


async def _sweep_loop() -> None:
    while True:
        await asyncio.sleep(60)
        _sweep()


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    _sweep()
    task = asyncio.create_task(_sweep_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def create_app() -> FastAPI:
    app = FastAPI(title="Signal Clone API", lifespan=_lifespan)
    init_db()
    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(users_router, prefix="/api/users", tags=["users"])
    app.include_router(contacts_router, prefix="/api/contacts", tags=["contacts"])
    app.include_router(conversations_router, prefix="/api/conversations", tags=["conversations"])
    app.include_router(members_router, prefix="/api/conversations", tags=["members"])
    app.include_router(messages_router, prefix="/api/conversations", tags=["messages"])
    app.include_router(receipts_router, prefix="/api/conversations", tags=["receipts"])
    app.include_router(events_router, prefix="/api", tags=["events"])
    app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
    app.include_router(attachments_router, prefix="/api/attachments", tags=["attachments"])
    return app


app = create_app()
