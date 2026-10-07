from seed.transform import build_db
from app.core.db import SessionLocal
from app.models import User, Message, Conversation, MessageReceipt
from sqlalchemy import select, func


def test_seed_builds_expected_shape(tmp_path):
    out = str(tmp_path / "seeded.db")
    build_db(out)
    import app.core.db as dbmod
    from sqlalchemy import create_engine
    eng = create_engine(f"sqlite:///{out}")
    s = SessionLocal(bind=eng)
    assert s.scalar(select(func.count()).select_from(User)) > 50
    assert s.scalar(select(func.count()).select_from(Conversation)) > 50
    assert s.scalar(select(func.count()).select_from(Message)) > 50
    demo = s.scalar(select(User).where(User.phone_number == "+15550000001"))
    assert demo is not None
    # corpus text, not the sample's corporate sentences
    bodies = [m.body for m in s.scalars(select(Message).limit(20))]
    assert not any("invoice" in b.lower() or "shipment" in b.lower() for b in bodies)
    # receipts exist for some messages but not all
    assert s.scalar(select(func.count()).select_from(MessageReceipt)) > 0
    s.close()
