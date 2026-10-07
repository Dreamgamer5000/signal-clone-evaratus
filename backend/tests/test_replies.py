import io

from fastapi.testclient import TestClient

from app.core.db import SessionLocal
from app.main import create_app
from app.models import Message


def boot(test_engine):
    app = create_app()
    a, b = TestClient(app), TestClient(app)
    for c, ph, un in ((a, "+15550000001", "alice"), (b, "+15550000002", "bob")):
        c.post("/api/auth/register", json={
            "phone_number": ph, "username": un,
            "display_name": un.title(), "avatar_color": "A100"})
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    conv = a.post("/api/conversations/direct", json={"user_id": bob_id}).json()
    return a, b, conv["conversation_id"]


def test_reply_stores_snapshot(test_engine):
    a, b, cid = boot(test_engine)
    target = a.post(f"/api/conversations/{cid}/messages",
                    json={"client_id": "cid-r000001", "body": "original hi"}).json()
    r = b.post(f"/api/conversations/{cid}/messages",
               json={"client_id": "cid-r000002", "body": "reply here",
                     "reply_to_id": target["message_id"]})
    assert r.status_code == 200
    msgs = a.get(f"/api/conversations/{cid}/messages").json()
    reply = [m for m in msgs if m["client_id"] == "cid-r000002"][0]
    assert reply["reply_to"] is not None
    assert reply["reply_to"]["message_id"] == target["message_id"]
    assert reply["reply_to"]["sender_name"] == "Alice"
    assert reply["reply_to"]["body"] == "original hi"
    assert reply["reply_to"]["deleted"] is False
    no_reply = [m for m in msgs if m["client_id"] == "cid-r000001"][0]
    assert no_reply["reply_to"] is None


def test_reply_cross_conversation_404(test_engine):
    a, b, cid = boot(test_engine)
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    other = a.post("/api/conversations/group",
                   json={"title": "Other", "user_ids": [bob_id]}).json()
    other_msg = a.post(f"/api/conversations/{other['conversation_id']}/messages",
                       json={"client_id": "cid-r000003", "body": "in other"}).json()
    r = b.post(f"/api/conversations/{cid}/messages",
               json={"client_id": "cid-r000004", "body": "cross",
                     "reply_to_id": other_msg["message_id"]})
    assert r.status_code == 404
    msgs = b.get(f"/api/conversations/{cid}/messages").json()
    assert all(m["client_id"] != "cid-r000004" for m in msgs)


def test_reply_missing_message_404(test_engine):
    a, b, cid = boot(test_engine)
    r = a.post(f"/api/conversations/{cid}/messages",
               json={"client_id": "cid-r000005", "body": "ghost",
                     "reply_to_id": 999999})
    assert r.status_code == 404


def test_reply_target_deleted_shows_tombstone(test_engine):
    a, b, cid = boot(test_engine)
    target = a.post(f"/api/conversations/{cid}/messages",
                    json={"client_id": "cid-r000006", "body": "delete me"}).json()
    b.post(f"/api/conversations/{cid}/messages",
           json={"client_id": "cid-r000007", "body": "still here",
                 "reply_to_id": target["message_id"]})
    db = SessionLocal()
    row = db.get(Message, target["message_id"])
    db.delete(row)
    db.commit()
    db.close()
    msgs = a.get(f"/api/conversations/{cid}/messages").json()
    reply = [m for m in msgs if m["client_id"] == "cid-r000007"][0]
    assert reply["reply_to"] is not None
    assert reply["reply_to"]["deleted"] is True
    assert reply["reply_to"]["message_id"] is None
    assert reply["reply_to"]["body"] == "delete me"
    assert reply["reply_to"]["sender_name"] == "Alice"


def test_reply_to_system_message(test_engine):
    a, b, cid = boot(test_engine)
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    g = a.post("/api/conversations/group",
               json={"title": "Sys", "user_ids": [bob_id]}).json()
    gid = g["conversation_id"]
    sys_msg = [m for m in a.get(f"/api/conversations/{gid}/messages").json()
               if m["kind"] == "system"][0]
    r = b.post(f"/api/conversations/{gid}/messages",
               json={"client_id": "cid-r000008", "body": "re: group",
                     "reply_to_id": sys_msg["message_id"]})
    assert r.status_code == 200
    msgs = a.get(f"/api/conversations/{gid}/messages").json()
    reply = [m for m in msgs if m["client_id"] == "cid-r000008"][0]
    assert reply["reply_to"]["message_id"] == sys_msg["message_id"]
    assert reply["reply_to"]["sender_name"] == "Alice"
    assert reply["reply_to"]["body"] == sys_msg["body"]
    assert reply["reply_to"]["deleted"] is False


def test_reply_via_multipart(test_engine):
    a, b, cid = boot(test_engine)
    target = a.post(f"/api/conversations/{cid}/messages",
                    json={"client_id": "cid-r000009", "body": "multi target"}).json()
    r = b.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-r000010", "body": "multi reply",
              "reply_to_id": str(target["message_id"])},
        files={"file": ("n.txt", io.BytesIO(b"hi"), "text/plain")},
    )
    assert r.status_code == 200
    reply = r.json()
    assert reply["reply_to"]["message_id"] == target["message_id"]
    assert reply["reply_to"]["sender_name"] == "Alice"
    assert reply["reply_to"]["body"] == "multi target"
    assert reply["reply_to"]["deleted"] is False
