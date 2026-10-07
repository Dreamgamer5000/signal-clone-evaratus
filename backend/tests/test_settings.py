from fastapi.testclient import TestClient
from app.main import create_app


def test_settings_roundtrip(test_engine):
    c = TestClient(create_app())
    c.post("/api/auth/register", json={
        "phone_number": "+15550000001", "username": "user",
        "display_name": "User", "avatar_color": "A100"})
    r = c.patch("/api/settings", json={"theme": "light", "read_receipts": "on"})
    assert r.status_code == 200
    assert c.get("/api/settings").json() == {"theme": "light", "read_receipts": "on"}
