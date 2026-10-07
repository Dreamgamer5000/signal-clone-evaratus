from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./app.db"
    OTP_CODE: str = "123456"
    COOKIE_NAME: str = "sig_session"
    SESSION_TTL_DAYS: int = 30
    SSE_HEARTBEAT_SECONDS: float = 20.0
    UPLOADS_DIR: str = "./uploads"


settings = Settings()
