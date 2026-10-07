from fastapi import FastAPI
from app.api.auth import router as auth_router
from app.core.db import init_db


def create_app() -> FastAPI:
    app = FastAPI(title="Signal Clone API")
    init_db()
    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    return app


app = create_app()
