from fastapi.testclient import TestClient
from app.main import create_app


def boot(test_engine):
    app = create_app()
    a, b = TestClient(app), TestClient(app)
    for c, ph, un in ((a, "+1", "alice"), (b, "+2", "bob")):
        c.post("/api/auth/register", json={
            "phone_number": ph, "username": un,
            "display_name": un.title(), "avatar_color": "A100"})
    return app, a, b


def test_direct_conversation_is_idempotent(test_engine):
    _, a, b = boot(test_engine)
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    c1 = a.post("/api/conversations/direct", json={"user_id": bob_id}).json()
    c2 = a.post("/api/conversations/direct", json={"user_id": bob_id}).json()
    assert c1["conversation_id"] == c2["conversation_id"]
    summary = a.get("/api/conversations").json()
    assert len(summary) == 1
    assert summary[0]["peer"]["username"] == "bob"


def test_group_create_lists_members(test_engine):
    _, a, b = boot(test_engine)
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    g = a.post("/api/conversations/group", json={"title": "Team", "user_ids": [bob_id]}).json()
    members = a.get(f"/api/conversations/{g['conversation_id']}/members").json()
    assert {m["role"] for m in members} == {"admin", "member"}
