from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import now_ms
from app.main import create_app
from app.models import Message
from app.services.ephemeral import sweep_once


def boot(test_engine):
    app = create_app()
    a, b = TestClient(app), TestClient(app)
    for c, ph, un in ((a, "+15550000001", "alice"), (b, "+15550000002", "bob")):
        c.post("/api/auth/register", json={
            "phone_number": ph, "username": un,
            "display_name": un.title(), "avatar_color": "A100"})
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    cid = a.post("/api/conversations/direct",
                 json={"user_id": bob_id}).json()["conversation_id"]
    return app, a, b, cid


def _backdate_messages(cid, age_ms):
    db = SessionLocal()
    stamp = now_ms() - age_ms
    for m in db.scalars(select(Message).where(Message.conversation_id == cid)):
        m.created_at = stamp
    db.commit()
    db.close()


def test_sweep_deletes_expired_messages(test_engine):
    _, a, b, cid = boot(test_engine)
    r = a.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": 30})
    assert r.status_code == 200
    a.post(f"/api/conversations/{cid}/messages",
           json={"client_id": "cid-eph-0001", "body": "gone soon"})
    _backdate_messages(cid, 60_000)
    db = SessionLocal()
    deleted = sweep_once(db)
    db.close()
    assert deleted >= 1
    assert a.get(f"/api/conversations/{cid}/messages").json() == []


def test_sweep_keeps_messages_without_timer(test_engine):
    _, a, b, cid = boot(test_engine)
    a.post(f"/api/conversations/{cid}/messages",
           json={"client_id": "cid-eph-0002", "body": "stays forever"})
    _backdate_messages(cid, 60_000)
    db = SessionLocal()
    deleted = sweep_once(db)
    db.close()
    assert deleted == 0
    msgs = a.get(f"/api/conversations/{cid}/messages").json()
    assert [m["body"] for m in msgs] == ["stays forever"]


def test_patch_sets_disappearing_and_writes_system_message(test_engine):
    _, a, b, cid = boot(test_engine)
    r = a.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": 30})
    assert r.status_code == 200
    assert r.json()["disappearing_seconds"] == 30
    msgs = a.get(f"/api/conversations/{cid}/messages").json()
    assert msgs[-1]["kind"] == "system"
    assert msgs[-1]["body"] == "Alice set disappearing messages to 30 seconds"
    r = a.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": None})
    assert r.status_code == 200
    assert r.json()["disappearing_seconds"] is None
    msgs = a.get(f"/api/conversations/{cid}/messages").json()
    assert msgs[-1]["kind"] == "system"
    assert msgs[-1]["body"] == "Alice turned off disappearing messages"


def test_patch_rejects_invalid_disappearing_seconds(test_engine):
    _, a, b, cid = boot(test_engine)
    r = a.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": 60})
    assert r.status_code == 422
    r = a.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": "1 hour"})
    assert r.status_code == 422


def test_patch_disappearing_requires_membership(test_engine):
    app, a, b, cid = boot(test_engine)
    c = TestClient(app)
    c.post("/api/auth/register", json={
        "phone_number": "+15550000003", "username": "carol",
        "display_name": "Carol", "avatar_color": "A100"})
    r = c.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": 30})
    assert r.status_code == 403
    assert a.get(f"/api/conversations/{cid}").json()["disappearing_seconds"] is None
