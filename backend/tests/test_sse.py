import json
import threading
import time

import httpx
import uvicorn


def test_sse_delivers_events_to_right_users(test_engine, tmp_path):
    """Real SSE client against a live uvicorn server (spec §9)."""
    from app.main import create_app
    app = create_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="error")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    time.sleep(1.0)

    with httpx.Client(base_url="http://127.0.0.1:8765", timeout=10) as a, \
         httpx.Client(base_url="http://127.0.0.1:8765", timeout=10) as b:
        for c, ph, un in ((a, "+15550000001", "alice"), (b, "+15550000002", "bob")):
            r = c.post("/api/auth/register", json={
                "phone_number": ph, "username": un,
                "display_name": un.title(), "avatar_color": "A100"})
            assert r.status_code == 200
        bob_id = b.get("/api/auth/me").json()["user"]["user_id"]
        cid = a.post("/api/conversations/direct",
                     json={"user_id": bob_id}).json()["conversation_id"]

        received = []

        def reader():
            with b.stream("GET", "/api/events") as resp:
                for line in resp.iter_lines():
                    if line.startswith("data: "):
                        received.append(json.loads(line[6:]))
                        return

        t2 = threading.Thread(target=reader, daemon=True)
        t2.start()
        time.sleep(0.5)
        a.post(f"/api/conversations/{cid}/messages",
               json={"client_id": "cid-sse-0001", "body": "hello from alice"})
        t2.join(timeout=10)

    assert received and received[0]["type"] == "message.new"
    assert received[0]["payload"]["body"] == "hello from alice"
    server.should_exit = True
