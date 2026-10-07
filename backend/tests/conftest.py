import pytest
from sqlalchemy import create_engine
from app.core.db import Base, SessionLocal, init_db
import app.core.db as dbmod


@pytest.fixture()
def test_engine(tmp_path):
    eng = create_engine(
        f"sqlite:///{tmp_path}/t.db",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(eng)
    dbmod.engine = eng
    dbmod.SessionLocal.configure(bind=eng)
    yield eng


@pytest.fixture()
def db(test_engine):
    s = SessionLocal()
    yield s
    s.close()
