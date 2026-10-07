import pytest
from fastapi.testclient import TestClient

from app.core.validators import normalize_phone
from app.main import create_app


def make_client(test_engine):
    return TestClient(create_app())


def register(c, **overrides):
    body = {
        "phone_number": "+15550000001",
        "username": "alice",
        "display_name": "Alice",
        "avatar_color": "A100",
    }
    body.update(overrides)
    return c.post("/api/auth/register", json=body)


def authed(test_engine):
    c = make_client(test_engine)
    assert register(c).status_code == 200
    return c


def authed_pair(test_engine):
    a = make_client(test_engine)
    b = make_client(test_engine)
    assert register(a).status_code == 200
    assert register(b, phone_number="+15550000002", username="bob",
                    display_name="Bob").status_code == 200
    bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
    conv = a.post("/api/conversations/direct", json={"user_id": bob_id})
    assert conv.status_code == 200
    return a, b, conv.json()["conversation_id"]


# --- phone numbers ---------------------------------------------------------

def test_phone_accepts_10_digits_and_normalizes(test_engine):
    assert normalize_phone("5550000001") == "+15550000001"
    assert normalize_phone("15550000001") == "+15550000001"
    assert normalize_phone("+1 555-000-0001") == "+15550000001"
    assert normalize_phone("+1 (555) 000-0001") == "+15550000001"


@pytest.mark.parametrize("bad", ["", "+1", "555000001", "555000000011", "abcdefghij", "+44 20 7946 0958"])
def test_phone_rejects_invalid(bad):
    with pytest.raises(ValueError):
        normalize_phone(bad)


def test_register_rejects_bad_phone(test_engine):
    c = make_client(test_engine)
    assert register(c, phone_number="12345").status_code == 422
    assert register(c, phone_number="not-a-phone").status_code == 422


def test_register_normalizes_phone(test_engine):
    c = make_client(test_engine)
    r = register(c, phone_number="555-000-0001")
    assert r.status_code == 200
    assert r.json()["user"]["phone_number"] == "+15550000001"


# --- usernames -------------------------------------------------------------

@pytest.mark.parametrize("bad", ["", "ab", "has space", "dot.", ".lead", "-lead", "x" * 33])
def test_register_rejects_bad_username(test_engine, bad):
    c = make_client(test_engine)
    assert register(c, username=bad).status_code == 422


def test_username_is_lowercased(test_engine):
    c = make_client(test_engine)
    r = register(c, phone_number="+15550000002", username="Bob-99")
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "bob-99"


# --- names / about / avatar ------------------------------------------------

def test_register_rejects_blank_or_huge_display_name(test_engine):
    c = make_client(test_engine)
    assert register(c, display_name="   ").status_code == 422
    assert register(c, display_name="x" * 81).status_code == 422


def test_register_rejects_unknown_avatar_color(test_engine):
    c = make_client(test_engine)
    assert register(c, avatar_color="Z999").status_code == 422


def test_patch_me_rejects_bad_about(test_engine):
    c = authed(test_engine)
    assert c.patch("/api/users/me", json={"about": "x" * 201}).status_code == 422
    assert c.patch("/api/users/me", json={"display_name": ""}).status_code == 422


# --- OTP code --------------------------------------------------------------

def test_otp_rejects_non_6_digit_code(test_engine):
    c = make_client(test_engine)
    for code in ["12345", "1234567", "abcdef", ""]:
        r = c.post("/api/auth/otp/verify",
                   json={"phone_number": "+15550000001", "code": code})
        assert r.status_code == 422, code


# --- ids -------------------------------------------------------------------

def test_path_ids_must_be_positive_ints(test_engine):
    c = authed(test_engine)
    assert c.get("/api/conversations/abc").status_code == 422
    assert c.get("/api/conversations/0").status_code == 422
    assert c.get("/api/conversations/-5/messages").status_code == 422
    assert c.delete("/api/contacts/1.5").status_code == 422


def test_direct_in_rejects_bad_user_id(test_engine):
    c = authed(test_engine)
    assert c.post("/api/conversations/direct", json={"user_id": 0}).status_code == 422
    assert c.post("/api/conversations/direct", json={"user_id": "abc"}).status_code == 422


# --- messages --------------------------------------------------------------

def test_message_body_limits(test_engine):
    c, b, cid = authed_pair(test_engine)
    assert c.post(f"/api/conversations/{cid}/messages",
                  json={"client_id": "cid-000001", "body": ""}).status_code == 422
    assert c.post(f"/api/conversations/{cid}/messages",
                  json={"client_id": "cid-000001", "body": "x" * 4001}).status_code == 422
    assert c.post(f"/api/conversations/{cid}/messages",
                  json={"client_id": "short", "body": "hi"}).status_code == 422


def test_receipt_ids_must_be_positive_and_nonempty(test_engine):
    c, b, cid = authed_pair(test_engine)
    assert c.post(f"/api/conversations/{cid}/receipts",
                  json={"message_ids": [], "status": "read"}).status_code == 422
    assert c.post(f"/api/conversations/{cid}/receipts",
                  json={"message_ids": [0], "status": "read"}).status_code == 422
    assert c.post(f"/api/conversations/{cid}/receipts",
                  json={"message_ids": [1], "status": "nope"}).status_code == 422


def test_group_title_and_members_validated(test_engine):
    c = authed(test_engine)
    assert c.post("/api/conversations/group",
                  json={"title": "", "user_ids": [2]}).status_code == 422
    assert c.post("/api/conversations/group",
                  json={"title": "Team", "user_ids": []}).status_code == 422
    assert c.post("/api/conversations/group",
                  json={"title": "Team", "user_ids": [0]}).status_code == 422


# --- settings keys ---------------------------------------------------------

def test_settings_key_pattern_enforced(test_engine):
    c = authed(test_engine)
    assert c.patch("/api/settings", json={"Bad Key!": "x"}).status_code == 422
    assert c.patch("/api/settings", json={"ok_key": "x" * 201}).status_code == 422
