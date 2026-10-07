from fastapi.testclient import TestClient
from app.main import create_app


def boot(test_engine):
    app = create_app()
    a, b = TestClient(app), TestClient(app)
    for c, ph, un in ((a, "+15550000001", "alice"), (b, "+15550000002", "bob")):
        c.post("/api/auth/register", json={
            "phone_number": ph, "username": un,
            "display_name": un.title(), "avatar_color": "A100"})
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    cid = a.post("/api/conversations/direct", json={"user_id": bob_id}).json()["conversation_id"]
    m = a.post(f"/api/conversations/{cid}/messages",
               json={"client_id": "cid-000001", "body": "hi"}).json()
    return a, b, cid, m["message_id"]


def test_delivered_then_read_updates_status(test_engine):
    a, b, cid, mid = boot(test_engine)
    r = b.post(f"/api/conversations/{cid}/receipts",
               json={"message_ids": [mid], "status": "delivered"})
    assert r.status_code == 204
    assert a.get(f"/api/conversations/{cid}/messages").json()[0]["status"] == "delivered"
    b.post(f"/api/conversations/{cid}/receipts",
           json={"message_ids": [mid], "status": "read"})
    assert a.get(f"/api/conversations/{cid}/messages").json()[0]["status"] == "read"


def test_sender_cannot_fabricate_receipts(test_engine):
    a, b, cid, mid = boot(test_engine)
    # alice marks her OWN message read — must not affect status
    a.post(f"/api/conversations/{cid}/receipts",
           json={"message_ids": [mid], "status": "read"})
    assert a.get(f"/api/conversations/{cid}/messages").json()[0]["status"] == "sent"


def test_non_member_cannot_receipt(test_engine):
    app = create_app()
    a, b = TestClient(app), TestClient(app)
    for c, ph, un in ((a, "+15550000001", "alice"), (b, "+15550000002", "bob")):
        c.post("/api/auth/register", json={
            "phone_number": ph, "username": un,
            "display_name": un.title(), "avatar_color": "A100"})
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    cid = a.post("/api/conversations/direct", json={"user_id": bob_id}).json()["conversation_id"]
    eve = TestClient(app)
    eve.post("/api/auth/register", json={
        "phone_number": "+15550000003", "username": "eve",
        "display_name": "Eve", "avatar_color": "A100"})
    r = eve.post(f"/api/conversations/{cid}/receipts",
                 json={"message_ids": [1], "status": "read"})
    assert r.status_code == 403
