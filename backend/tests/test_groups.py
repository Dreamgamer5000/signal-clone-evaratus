from fastapi.testclient import TestClient
from app.main import create_app


def boot(test_engine):
    app = create_app()
    clients = {}
    for ph, un in (("+15550000001", "alice"), ("+15550000002", "bob"), ("+15550000003", "carol")):
        c = TestClient(app)
        c.post("/api/auth/register", json={
            "phone_number": ph, "username": un,
            "display_name": un.title(), "avatar_color": "A100"})
        clients[un] = c
    ids = {u: c.get("/api/auth/me").json()["user"]["user_id"] for u, c in clients.items()}
    g = clients["alice"].post("/api/conversations/group",
                              json={"title": "T", "user_ids": [ids["bob"]]}).json()
    return app, clients, ids, g["conversation_id"]


def test_admin_add_remove_and_system_messages(test_engine):
    app, cl, ids, cid = boot(test_engine)
    r = cl["alice"].post(f"/api/conversations/{cid}/members", json={"user_id": ids["carol"]})
    assert r.status_code == 200
    msgs = cl["bob"].get(f"/api/conversations/{cid}/messages").json()
    assert any(m["kind"] == "system" and "added" in m["body"] for m in msgs)
    assert cl["bob"].post(f"/api/conversations/{cid}/members",
                          json={"user_id": ids["carol"]}).status_code == 403
    assert cl["alice"].delete(f"/api/conversations/{cid}/members/{ids['carol']}").status_code == 204


def test_last_admin_protected(test_engine):
    app, cl, ids, cid = boot(test_engine)
    r = cl["alice"].patch(f"/api/conversations/{cid}/members/{ids['alice']}",
                          json={"role": "member"})
    assert r.status_code == 409
    assert cl["alice"].delete(f"/api/conversations/{cid}/members/{ids['alice']}").status_code == 409
