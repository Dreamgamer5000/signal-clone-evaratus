import pytest
from fastapi.testclient import TestClient

from app.core.validators import REACTION_EMOJI, validate_emoji
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


def _ids(a, b):
    return (
        a.get("/api/auth/me").json()["user"]["user_id"],
        b.get("/api/auth/me").json()["user"]["user_id"],
    )


def test_reaction_add_and_remove(test_engine):
    a, b, cid = boot(test_engine)
    mid = a.post(f"/api/conversations/{cid}/messages",
                 json={"client_id": "cid-react-01", "body": "hi"}).json()["message_id"]
    r = b.post(f"/api/conversations/{cid}/messages/{mid}/reactions", json={"emoji": "👍"})
    assert r.status_code == 200 and r.json()["emoji"] == "👍"
    assert r.json()["user_ids"] == [b.get("/api/auth/me").json()["user"]["user_id"]]
    # idempotent re-add
    assert b.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                  json={"emoji": "👍"}).status_code == 200
    # invalid emoji -> 422
    assert b.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                  json={"emoji": "not-emoji"}).status_code == 422
    # remove idempotent
    assert b.delete(f"/api/conversations/{cid}/messages/{mid}/reactions/👍").status_code == 204
    assert b.delete(f"/api/conversations/{cid}/messages/{mid}/reactions/👍").status_code == 204


def test_reaction_user_ids_full_and_sorted(test_engine):
    a, b, cid = boot(test_engine)
    alice_id, bob_id = _ids(a, b)
    mid = a.post(f"/api/conversations/{cid}/messages",
                 json={"client_id": "cid-react-02", "body": "hi"}).json()["message_id"]
    assert b.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                  json={"emoji": "👍"}).status_code == 200
    r = a.post(f"/api/conversations/{cid}/messages/{mid}/reactions", json={"emoji": "👍"})
    assert r.status_code == 200
    assert r.json()["user_ids"] == sorted([alice_id, bob_id])
    assert b.delete(f"/api/conversations/{cid}/messages/{mid}/reactions/👍").status_code == 204
    r = a.post(f"/api/conversations/{cid}/messages/{mid}/reactions", json={"emoji": "👍"})
    assert r.status_code == 200
    assert r.json()["user_ids"] == [alice_id]


def test_reaction_invalid_emoji(test_engine):
    a, b, cid = boot(test_engine)
    mid = a.post(f"/api/conversations/{cid}/messages",
                 json={"client_id": "cid-react-03", "body": "hi"}).json()["message_id"]
    for bad in ("not-emoji", "🦄", "👍👍", ""):
        assert b.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                      json={"emoji": bad}).status_code == 422
    assert b.delete(f"/api/conversations/{cid}/messages/{mid}/reactions/not-emoji").status_code == 422
    assert b.delete(f"/api/conversations/{cid}/messages/{mid}/reactions/🦄").status_code == 422
    assert b.delete(f"/api/conversations/{cid}/messages/{mid}/reactions/👍").status_code == 204


def test_reaction_requires_membership(test_engine):
    a, b, cid = boot(test_engine)
    mid = a.post(f"/api/conversations/{cid}/messages",
                 json={"client_id": "cid-react-04", "body": "hi"}).json()["message_id"]
    eve = TestClient(create_app())
    eve.post("/api/auth/register", json={
        "phone_number": "+15550000003", "username": "eve",
        "display_name": "Eve", "avatar_color": "A130"})
    assert eve.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                    json={"emoji": "👍"}).status_code == 403
    assert eve.delete(f"/api/conversations/{cid}/messages/{mid}/reactions/👍").status_code == 403


def test_reaction_message_must_be_in_conversation(test_engine):
    a, b, cid = boot(test_engine)
    alice_id, bob_id = _ids(a, b)
    gid = a.post("/api/conversations/group",
                 json={"title": "Elsewhere", "user_ids": [bob_id]}).json()["conversation_id"]
    other_mid = a.post(f"/api/conversations/{gid}/messages",
                       json={"client_id": "cid-react-05", "body": "far away"}).json()["message_id"]
    assert b.post(f"/api/conversations/{cid}/messages/{other_mid}/reactions",
                  json={"emoji": "👍"}).status_code == 404
    assert b.delete(
        f"/api/conversations/{cid}/messages/{other_mid}/reactions/👍"
    ).status_code == 404
    assert b.post(f"/api/conversations/{cid}/messages/999999/reactions",
                  json={"emoji": "👍"}).status_code == 404
    assert b.post(f"/api/conversations/{cid}/messages/0/reactions",
                  json={"emoji": "👍"}).status_code == 422


def test_reactions_in_message_list(test_engine):
    a, b, cid = boot(test_engine)
    alice_id, bob_id = _ids(a, b)
    mid = a.post(f"/api/conversations/{cid}/messages",
                 json={"client_id": "cid-react-06", "body": "hi"}).json()["message_id"]
    assert b.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                  json={"emoji": "👍"}).status_code == 200
    assert a.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                  json={"emoji": "👍"}).status_code == 200
    assert a.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                  json={"emoji": "❤️"}).status_code == 200
    msgs = a.get(f"/api/conversations/{cid}/messages").json()
    assert [m["message_id"] for m in msgs] == [mid]
    by_emoji = {r["emoji"]: r["user_ids"] for r in msgs[0]["reactions"]}
    assert by_emoji == {"👍": sorted([alice_id, bob_id]), "❤️": [alice_id]}
    summary = next(
        c for c in a.get("/api/conversations").json()
        if c["conversation_id"] == cid
    )
    last = summary["last_message"]
    assert last["message_id"] == mid
    assert {r["emoji"]: r["user_ids"] for r in last["reactions"]} == by_emoji


def test_reaction_sse_event_published(test_engine, monkeypatch):
    import app.api.messages as messages_mod

    a, b, cid = boot(test_engine)
    alice_id, bob_id = _ids(a, b)
    mid = a.post(f"/api/conversations/{cid}/messages",
                 json={"client_id": "cid-react-07", "body": "hi"}).json()["message_id"]
    events = []

    def capture(user_ids, event_type, payload):
        events.append((sorted(user_ids), event_type, payload))

    monkeypatch.setattr(messages_mod.broker, "publish", capture)
    assert b.post(f"/api/conversations/{cid}/messages/{mid}/reactions",
                  json={"emoji": "🎉"}).status_code == 200
    assert events[-1] == (
        sorted([alice_id, bob_id]),
        "reaction.updated",
        {"conversation_id": cid, "message_id": mid, "emoji": "🎉", "user_ids": [bob_id]},
    )
    events.clear()
    assert b.delete(f"/api/conversations/{cid}/messages/{mid}/reactions/🎉").status_code == 204
    assert events[-1] == (
        sorted([alice_id, bob_id]),
        "reaction.updated",
        {"conversation_id": cid, "message_id": mid, "emoji": "🎉", "user_ids": []},
    )


def test_validate_emoji_allow_list():
    assert len(REACTION_EMOJI) == 32
    assert len(set(REACTION_EMOJI)) == 32
    for emoji in REACTION_EMOJI:
        assert validate_emoji(emoji) == emoji
    for bad in ("", "not-emoji", "🦄", "👍👍", "👍 "):
        with pytest.raises(ValueError):
            validate_emoji(bad)
