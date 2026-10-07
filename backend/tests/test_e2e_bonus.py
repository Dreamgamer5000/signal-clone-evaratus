import io
import json
import threading
import time

import httpx
import uvicorn


def test_bonus_conversation_flow(test_engine, tmp_path):
    """attachment → reaction → reply → disappearing → read receipts, over live HTTP+SSE."""
    import app.core.db as dbmod
    from sqlalchemy import create_engine
    from app.core.db import Base
    from app.broker import broker

    broker._queues.clear()
    broker._presence.clear()

    eng = create_engine(
        f"sqlite:///{tmp_path}/e2e_bonus.db",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(eng)
    dbmod.engine = eng
    dbmod.SessionLocal.configure(bind=eng)

    from app.main import create_app

    config = uvicorn.Config(create_app(), host="127.0.0.1", port=8769, log_level="error")
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()
    time.sleep(1.0)

    events = []
    stop_reading = threading.Event()

    def listen(c):
        with c.stream("GET", "/api/events") as r:
            for line in r.iter_lines():
                if stop_reading.is_set():
                    return
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))

    png = b"\x89PNG\r\n\x1a\n" + b"e2e-bonus-pixels"

    with httpx.Client(base_url="http://127.0.0.1:8769", timeout=10) as a, \
         httpx.Client(base_url="http://127.0.0.1:8769", timeout=10) as b:
        for c, ph, un in ((a, "+15550000001", "alice"), (b, "+15550000002", "bob")):
            r = c.post("/api/auth/register", json={
                "phone_number": ph, "username": un,
                "display_name": un.title(), "avatar_color": "A100"})
            assert r.status_code == 200
        bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
        r = a.post("/api/contacts", json={"phone_or_username": "bob"})
        assert r.status_code == 200
        cid = a.post("/api/conversations/direct", json={"user_id": bob_id}).json()["conversation_id"]

        t = threading.Thread(target=listen, args=(b,), daemon=True)
        t.start()
        deadline = time.time() + 5
        while time.time() < deadline and not broker.has_connection(bob_id):
            time.sleep(0.05)
        assert broker.has_connection(bob_id), "bob's SSE stream never subscribed"

        att_resp = a.post(
            f"/api/conversations/{cid}/messages",
            data={"client_id": "e2e-bonus-1", "body": "photo"},
            files={"file": ("photo.png", io.BytesIO(png), "image/png")},
        )
        assert att_resp.status_code == 200
        att_msg = att_resp.json()
        assert att_msg["attachments"][0]["file_name"] == "photo.png"
        att_id = att_msg["attachments"][0]["attachment_id"]
        got = b.get(f"/api/attachments/{att_id}/file")
        assert got.status_code == 200
        assert got.content == png

        r = b.post(
            f"/api/conversations/{cid}/messages/{att_msg['message_id']}/reactions",
            json={"emoji": "👍"},
        )
        assert r.status_code == 200
        assert r.json()["user_ids"] == [bob_id]
        assert b.post(
            f"/api/conversations/{cid}/messages/{att_msg['message_id']}/reactions",
            json={"emoji": "zzz"},
        ).status_code == 422

        reply_resp = a.post(f"/api/conversations/{cid}/messages", json={
            "client_id": "e2e-bonus-2", "body": "nice one",
            "reply_to_id": att_msg["message_id"]})
        assert reply_resp.status_code == 200
        reply_msg = reply_resp.json()
        assert reply_msg["reply_to"]["body"] == "photo"
        assert reply_msg["reply_to"]["deleted"] is False

        r = a.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": 30})
        assert r.status_code == 200
        msgs = a.get(f"/api/conversations/{cid}/messages").json()
        assert any(m["kind"] == "system" and "disappearing" in m["body"] for m in msgs), msgs

        r = b.post(f"/api/conversations/{cid}/receipts",
                   json={"message_ids": [reply_msg["message_id"]], "status": "read"})
        assert r.status_code == 204

        def event_counts():
            types = [e["type"] for e in events]
            return (
                types.count("message.new"),
                types.count("reaction.updated"),
                types.count("conversation.updated"),
                types.count("message.status"),
            )

        deadline = time.time() + 8
        while time.time() < deadline:
            mn, ru, cu, ms = event_counts()
            if mn >= 2 and ru >= 1 and cu >= 1 and ms >= 1:
                break
            time.sleep(0.2)
        types = [e["type"] for e in events]
        assert types.count("message.new") >= 2, types
        assert types.count("reaction.updated") >= 1, types
        assert types.count("conversation.updated") >= 1, types
        assert types.count("message.status") >= 1, types

        msgs = a.get(f"/api/conversations/{cid}/messages").json()
        final_reply = [m for m in msgs if m["client_id"] == "e2e-bonus-2"][0]
        assert final_reply["reply_to"]["deleted"] is False
        final_att = [m for m in msgs if m["client_id"] == "e2e-bonus-1"][0]
        assert len(final_att["attachments"]) == 1

    stop_reading.set()
    server.should_exit = True
