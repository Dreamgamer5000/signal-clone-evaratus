from fastapi.testclient import TestClient
from app.main import create_app


def make_client(test_engine):
    return TestClient(create_app())


def test_register_then_me_logout(test_engine):
    c = make_client(test_engine)
    r = c.post("/api/auth/register", json={
        "phone_number": "+15550000001", "username": "you",
        "display_name": "You", "avatar_color": "A120"})
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "you"
    assert c.get("/api/auth/me").json()["user"]["phone_number"] == "+15550000001"
    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401


def test_verify_needs_registration(test_engine):
    c = make_client(test_engine)
    c.post("/api/auth/otp/start", json={"phone_number": "+15550000002"})
    r = c.post("/api/auth/otp/verify", json={"phone_number": "+15550000002", "code": "123456"})
    assert r.status_code == 428


def test_verify_existing_user_logs_in(test_engine):
    c = make_client(test_engine)
    c.post("/api/auth/register", json={
        "phone_number": "+15550000003", "username": "bob",
        "display_name": "Bob", "avatar_color": "A130"})
    c.post("/api/auth/logout")
    r = c.post("/api/auth/otp/verify", json={"phone_number": "+15550000003", "code": "123456"})
    assert r.status_code == 200
    assert c.get("/api/auth/me").status_code == 200


def test_wrong_otp_rejected(test_engine):
    c = make_client(test_engine)
    r = c.post("/api/auth/otp/verify", json={"phone_number": "+15550000004", "code": "000000"})
    assert r.status_code == 401
