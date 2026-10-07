from fastapi import FastAPI
from app.api.auth import router as auth_router
from app.api.contacts import router as contacts_router
from app.api.conversations import router as conversations_router
from app.api.users import router as users_router
from app.core.db import init_db


def create_app() -> FastAPI:
    app = FastAPI(title="Signal Clone API")
    init_db()
    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(users_router, prefix="/api/users", tags=["users"])
    app.include_router(contacts_router, prefix="/api/contacts", tags=["contacts"])
    app.include_router(conversations_router, prefix="/api/conversations", tags=["conversations"])
    return app


app = create_app()
