import json
import threading
import time

import httpx
import uvicorn


def test_full_conversation_flow(test_engine, tmp_path):
    """register → contact → send → typing → delivered → read, over live HTTP+SSE."""
    import app.core.db as dbmod
    from sqlalchemy import create_engine
    from app.core.db import Base

    eng = create_engine(
        f"sqlite:///{tmp_path}/e2e.db",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(eng)
    dbmod.engine = eng
    dbmod.SessionLocal.configure(bind=eng)

    from app.main import create_app

    config = uvicorn.Config(create_app(), host="127.0.0.1", port=8766, log_level="error")
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

    with httpx.Client(base_url="http://127.0.0.1:8766", timeout=10) as a, \
         httpx.Client(base_url="http://127.0.0.1:8766", timeout=10) as b:
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
        time.sleep(0.5)
        a.post(f"/api/conversations/{cid}/typing", json={"active": True})
        m = a.post(f"/api/conversations/{cid}/messages",
                   json={"client_id": "cid-e2e-0001", "body": "hey"}).json()
        b.post(f"/api/conversations/{cid}/receipts",
               json={"message_ids": [m["message_id"]], "status": "delivered"})
        b.post(f"/api/conversations/{cid}/receipts",
               json={"message_ids": [m["message_id"]], "status": "read"})
        time.sleep(1.0)

        types = [e["type"] for e in events]
        assert "typing.update" in types, f"missing typing.update in {types}"
        assert "message.new" in types, f"missing message.new in {types}"
        assert types.count("message.status") >= 2, f"missing receipts in {types}"

        msgs = a.get(f"/api/conversations/{cid}/messages").json()
        assert msgs[-1]["status"] == "read", msgs[-1]

    stop_reading.set()
    server.should_exit = True
