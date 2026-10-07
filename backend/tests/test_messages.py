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
    conv = a.post("/api/conversations/direct", json={"user_id": bob_id}).json()
    return a, b, conv["conversation_id"]


def test_send_is_idempotent_on_client_id(test_engine):
    a, b, cid = boot(test_engine)
    m1 = a.post(f"/api/conversations/{cid}/messages",
                json={"client_id": "cid-000001", "body": "hi"}).json()
    m2 = a.post(f"/api/conversations/{cid}/messages",
                json={"client_id": "cid-000001", "body": "hi"}).json()
    assert m1["message_id"] == m2["message_id"]
    msgs = b.get(f"/api/conversations/{cid}/messages").json()
    assert len(msgs) == 1
    assert msgs[0]["status"] == "sent"


def test_history_pagination(test_engine):
    a, b, cid = boot(test_engine)
    ids = [a.post(f"/api/conversations/{cid}/messages",
                  json={"client_id": f"cid-{i:06d}", "body": f"m{i}"}).json()["message_id"]
           for i in range(5)]
    # First page = newest 2, ascending (chat opens at the bottom)
    page = a.get(f"/api/conversations/{cid}/messages?limit=2").json()
    assert [m["message_id"] for m in page] == ids[3:5]
    # Scrolling up: the 2 immediately older than the oldest loaded
    page2 = a.get(f"/api/conversations/{cid}/messages?limit=2&before_id={ids[3]}").json()
    assert [m["message_id"] for m in page2] == ids[1:3]
