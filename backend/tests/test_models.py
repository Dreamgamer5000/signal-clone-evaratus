from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models import User, Conversation
from app.core.db import SessionLocal, init_db
from app.core import security
from app.core.security import create_session


def test_direct_key_enforces_one_thread_per_pair(test_engine):
    init_db(test_engine)
    db = SessionLocal()
    a = User(phone_number="+1", username="a", display_name="A", avatar_color="A100", created_at=1)
    b = User(phone_number="+2", username="b", display_name="B", avatar_color="A110", created_at=1)
    db.add_all([a, b]); db.commit()
    c1 = Conversation(type="direct", direct_key="1:2", created_by=a.user_id, created_at=1)
    db.add(c1); db.commit()
    c2 = Conversation(type="direct", direct_key="1:2", created_by=a.user_id, created_at=2)
    db.add(c2)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    else:
        raise AssertionError("duplicate direct_key must fail")
    db.close()


def test_session_token_is_hashed(test_engine):
    init_db(test_engine)
    db = SessionLocal()
    u = User(phone_number="+1", username="a", display_name="A", avatar_color="A100", created_at=1)
    db.add(u); db.commit()
    raw = create_session(db, u.user_id)
    assert len(raw) == 64
    assert security.hash_token(raw) != raw
    db.close()
