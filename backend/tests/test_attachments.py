import io
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
    return a, b, cid


def test_upload_image_message(test_engine):
    a, b, cid = boot(test_engine)
    r = a.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-attach-01", "body": "look at this"},
        files={"file": ("pic.png", io.BytesIO(b"\x89PNG fake"), "image/png")},
    )
    assert r.status_code == 200
    atts = r.json()["attachments"]
    assert len(atts) == 1
    assert atts[0]["file_name"] == "pic.png"
    assert atts[0]["mime_type"] == "image/png"
    got = b.get(f"/api/attachments/{atts[0]['attachment_id']}/file")
    assert got.status_code == 200
    assert got.content.startswith(b"\x89PNG")


def test_download_requires_membership(test_engine):
    a, b, cid = boot(test_engine)
    att_id = a.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-attach-02"},
        files={"file": ("n.txt", io.BytesIO(b"hi"), "text/plain")},
    ).json()["attachments"][0]["attachment_id"]
    eve = TestClient(create_app())
    eve.post("/api/auth/register", json={
        "phone_number": "+15550000003", "username": "eve",
        "display_name": "Eve", "avatar_color": "A130"})
    assert eve.get(f"/api/attachments/{att_id}/file").status_code == 403
    assert a.get("/api/attachments/999999/file").status_code == 404


def test_upload_limits(test_engine):
    a, b, cid = boot(test_engine)
    big = io.BytesIO(b"x" * (10 * 1024 * 1024 + 1))
    assert a.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-attach-03"},
        files={"file": ("big.bin", big, "application/octet-stream")},
    ).status_code == 415          # mime not allow-listed
    exe = io.BytesIO(b"MZ")
    assert a.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-attach-04"},
        files={"file": ("x.exe", exe, "application/x-msdownload")},
    ).status_code == 415
