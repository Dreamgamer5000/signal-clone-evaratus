from fastapi.testclient import TestClient
from app.main import create_app


def register(c, phone, username):
    return c.post("/api/auth/register", json={
        "phone_number": phone, "username": username,
        "display_name": username.title(), "avatar_color": "A100"})


def test_contacts_crud_and_search(test_engine):
    app = create_app()
    alice = TestClient(app)
    register(alice, "+100", "alice")
    # second user in the same app instance
    bob = TestClient(app)
    register(bob, "+200", "bob")

    r = alice.post("/api/contacts", json={"phone_or_username": "bob"})
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "bob"
    assert alice.post("/api/contacts", json={"phone_or_username": "bob"}).status_code == 409
    assert alice.post("/api/contacts", json={"phone_or_username": "alice"}).status_code == 400
    assert alice.post("/api/contacts", json={"phone_or_username": "ghost"}).status_code == 404

    assert len(alice.get("/api/contacts").json()) == 1
    assert [u["username"] for u in alice.get("/api/users?q=bo").json()] == ["bob"]

    cid = alice.get("/api/contacts").json()[0]["contact_id"]
    assert alice.delete(f"/api/contacts/{cid}").status_code == 204
    assert alice.get("/api/contacts").json() == []


def test_patch_me(test_engine):
    c = TestClient(create_app())
    register(c, "+300", "carol")
    r = c.patch("/api/users/me", json={"display_name": "Carol A.", "about": "hi"})
    assert r.json()["display_name"] == "Carol A."
