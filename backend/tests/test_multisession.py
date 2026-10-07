import json
import threading
import time

import httpx
import uvicorn


def test_broker_has_connection_tracks_sessions():
    from app.broker import EventBroker

    br = EventBroker()
    q1 = br.subscribe(1)
    q2 = br.subscribe(1)
    assert br.has_connection(1)
    br.unsubscribe(1, q1)
    assert br.has_connection(1)  # second tab still attached
    br.unsubscribe(1, q2)
    assert not br.has_connection(1)


def _stream_until(client, close_event, lines=None):
    """SSE reader that closes its own connection once `close_event` is set."""
    with client.stream("GET", "/api/events") as r:
        for line in r.iter_lines():
            if close_event.is_set():
                return
            if lines is not None and line.startswith("data: "):
                lines.append(json.loads(line[6:]))


def test_presence_stays_online_across_sessions(test_engine, tmp_path):
    """Closing one tab must not mark the user offline while another tab lives."""
    import app.core.db as dbmod
    from sqlalchemy import create_engine
    from app.core.db import Base
    from app.broker import broker
    from app.core.config import settings as app_settings

    broker._queues.clear()
    broker._presence.clear()
    old_hb = app_settings.SSE_HEARTBEAT_SECONDS
    app_settings.SSE_HEARTBEAT_SECONDS = 0.4  # fast line flow so readers can exit

    try:
        eng = create_engine(
            f"sqlite:///{tmp_path}/pres.db",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(eng)
        dbmod.engine = eng
        dbmod.SessionLocal.configure(bind=eng)

        from app.main import create_app

        config = uvicorn.Config(create_app(), host="127.0.0.1", port=8768, log_level="error")
        server = uvicorn.Server(config)
        threading.Thread(target=server.run, daemon=True).start()
        time.sleep(1.0)

        bob_events: list = []
        bob_stop = threading.Event()

        with httpx.Client(base_url="http://127.0.0.1:8768", timeout=10) as a, \
             httpx.Client(base_url="http://127.0.0.1:8768", timeout=10) as a2, \
             httpx.Client(base_url="http://127.0.0.1:8768", timeout=10) as b:
            assert a.post("/api/auth/register", json={
                "phone_number": "+15550000001", "username": "alice",
                "display_name": "Alice", "avatar_color": "A100"}).status_code == 200
            # second session (another tab/device) logs into the SAME account
            assert a2.post("/api/auth/otp/verify", json={
                "phone_number": "+15550000001", "code": "123456"}).status_code == 200
            assert b.post("/api/auth/register", json={
                "phone_number": "+15550000002", "username": "bob",
                "display_name": "Bob", "avatar_color": "A110"}).status_code == 200

            threading.Thread(
                target=_stream_until, args=(b, bob_stop, bob_events), daemon=True
            ).start()
            time.sleep(0.5)

            tab1_stop = threading.Event()
            tab2_stop = threading.Event()
            threading.Thread(target=_stream_until, args=(a, tab1_stop), daemon=True).start()
            threading.Thread(target=_stream_until, args=(a2, tab2_stop), daemon=True).start()

            def events_for(online: bool):
                return [
                    e for e in bob_events
                    if e["type"] == "presence.update"
                    and e["payload"]["online"] is online
                ]

            # baseline: bob must have SEEN alice come online (non-vacuous)
            deadline = time.time() + 8
            while time.time() < deadline and not events_for(True):
                time.sleep(0.2)
            assert events_for(True), f"bob never saw alice online: {bob_events}"

            # close tab 1 -> alice must NOT go offline
            tab1_stop.set()
            time.sleep(2.5)
            assert events_for(False) == [], f"premature offline: {events_for(False)}"

            # close tab 2 (last session) -> alice goes offline
            tab2_stop.set()
            deadline = time.time() + 8
            while time.time() < deadline and not events_for(False):
                time.sleep(0.2)
            assert events_for(False), f"expected offline after last tab closed: {bob_events}"

        bob_stop.set()
        server.should_exit = True
    finally:
        app_settings.SSE_HEARTBEAT_SECONDS = old_hb
