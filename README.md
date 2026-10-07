# Signal Clone — `signal-clone-evaratus`

A functional clone of the **Signal** messaging application: mocked phone/OTP
authentication, contacts, one-on-one and group conversations, real-time
messaging with delivery/read receipts, typing indicators and presence — in a
UI that visually matches Signal (Signal-Desktop on desktop/tablet,
Signal-Android styling on mobile).

**Live demo:** https://signal.rejit.in — log in with `+15550000001` and OTP
`123456` (or register any phone number).

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS 4, zustand | Signal design tokens (ultramarine `#2c6bed`, Inter, gray scale) |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2 | typed REST + one SSE stream |
| Database | SQLite (WAL) | own schema — see `docs/schema.md` |
| Real-time | **SSE** (`GET /api/events`) + REST POSTs | plain HTTP through proxies; `EventSource` auto-reconnect |
| Deploy | Docker → GCP Artifact Registry → VM behind Caddy | `signal.rejit.in` |

Why SSE instead of WebSockets: no upgrade handshake to break behind
Cloudflare/Caddy, native browser auto-reconnect (no custom resume protocol),
and the POST response doubles as the message ack. This app does not need the
bidirectional throughput of a raw socket.

## Architecture

```
signal-clone-evaratus/
├── frontend/          Next.js app (App Router)
│   ├── app/           /login, /register, /chats, /chats/[id], /settings
│   ├── components/    ConversationList, ChatPane, MessageBubble, Composer,
│   │                  NewChatModal, NewGroupModal, GroupInfoPanel, ToastHost...
│   └── lib/           api client, sse client, zustand store, status/tick logic
├── backend/
│   ├── app/
│   │   ├── api/       auth, users, contacts, conversations, messages,
│   │   │              members, receipts, events, settings
│   │   ├── core/      config, db session, security (cookie sessions)
│   │   ├── models.py  SQLAlchemy schema (docs/schema.md)
│   │   ├── services/  conversation resolution, message/receipt logic
│   │   └── broker.py  in-memory SSE fan-out (per-user queues)
│   ├── tests/         pytest (auth, CRUD, receipts, SSE, e2e flow)
│   └── seed/          sample-db transform + natural chat corpus
├── deploy/            Dockerfiles, docker-compose.yml, Caddyfile, deploy.sh
└── docs/              schema.md, api.md
```

**Data flow:** REST carries durable operations (auth, contacts, conversation
CRUD, send, receipts). `GET /api/events` streams server→client events
(`message.new`, `message.status`, `typing.update`, `presence.update`,
`conversation.updated`) to every connected session. Typing and presence live
only in server memory; messages/receipts are the durable log the client
refetches on reconnect.

## Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m seed.transform --out app.db     # build the demo database
uvicorn app.main:app --reload             # http://localhost:8000
```

Environment (all optional): `DATABASE_URL` (default
`sqlite:///./app.db`), `OTP_CODE` (default `123456`), `COOKIE_NAME`,
`SESSION_TTL_DAYS`, `SSE_HEARTBEAT_SECONDS`.

### Frontend

```bash
cd frontend
npm install
npm run dev                               # http://localhost:3000
```

The dev server talks to `http://localhost:8000` via the production proxy
layout; in production Caddy routes `/api/*` to the backend and everything
else to Next.js (see `deploy/Caddyfile`).

### Seed / demo accounts

`python -m seed.transform` imports the provided sample SQLite dump
(users, contacts, groups, memberships, message timeline), replaces message
bodies with natural chat text, remaps statuses to receipt rows, and adds a
demo user with fresh conversations:

| Login | OTP | Notes |
|---|---|---|
| `+15550000001` | `123456` | demo user "You" — ready-made chats |

## Database schema

See **`docs/schema.md`** for full DDL. Highlights: one `conversations` table
for both direct and group threads (`direct_key` guarantees one thread per
pair), `messages.client_id` for idempotent sends, `message_receipts` with
delivered/read timestamps, message status **derived** (never stored), read
cursor + unread counts on `conversation_members`, group roles
(`admin`/`member`) and system messages (`kind='system'`).

## API overview

See **`docs/api.md`** for the full endpoint table and SSE event catalog, or
run the backend and open `http://localhost:8000/docs` (OpenAPI).

## Testing

```bash
cd backend  && .venv/bin/pytest          # 21 tests: auth, CRUD, receipts, SSE, e2e
cd frontend && npm test                  # vitest: time, status ticks, store, SSE reconnect
             && npm run typecheck        # tsc --noEmit
```

The e2e test boots a real uvicorn server and drives a full conversation over
HTTP + SSE: register → contact → typing → send → delivered → read.

## Deployment

`deploy/` contains everything used in production:

- `Dockerfile.backend` / `Dockerfile.frontend` (Next standalone output)
- `docker-compose.yml` — both services on the `web_net` network with a named
  volume for SQLite; the backend seeds the DB on first start
- `Caddyfile` — `signal.rejit.in` routes `/api/*` to the backend (with
  `flush_interval -1` so SSE streams) and the rest to Next.js
- `deploy.sh` — build + push images to Artifact Registry, then pull and start
  the compose stack on the VM

Images: `GCP_REGION-docker.pkg.dev/GCP_PROJECT_ID/GCP_REPO_NAME/
signal-{backend,frontend}`.

## Assumptions

- OTP verification is mocked: the code is always `123456`, no SMS is sent.
- Real end-to-end encryption is **not** implemented (per the assignment:
  encryption can be mocked). Nothing is claimed to be encrypted.
- "Online" is derived from an active SSE connection; `last_seen_at` updates on
  disconnect. Single-device sessions (no multi-device sync).
- Voice/video calls, stories, and linked devices are "Coming Soon" placeholders.
- Message attachments, reactions, reply-quote, disappearing messages and dark
  mode are future/bonus work.

## Credits

UI is inspired by Signal's design language (colors, typography, layout
conventions). **No code from Signal's repositories is reused** — the design
tokens and interaction patterns informed an original implementation.
