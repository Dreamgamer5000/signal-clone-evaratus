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

## Features

- **Auth** — phone + mocked OTP (`123456`), profile (display name, about,
  Signal-palette avatar), real session cookies with logout revocation
- **Contacts** — find people by phone number or `@username`, one-way contact
  book (Signal-style: no invites or approvals)
- **Messaging** — 1:1 and group chats, optimistic send with
  *sending → sent → delivered → read* ticks, typing indicators, online /
  last-seen presence
- **Multi-session** — the same account can be open in several tabs/devices at
  once: messages fan out to every session, read/delivery state syncs across
  them, and presence stays online until the **last** session disconnects
- **Groups** — create with name + members, admin controls (add/remove/promote,
  last-admin protection), system messages
- **Signal experience** — conversation list (search, unread pills, pinned,
  previews), date dividers, toasts, settings shells, "Coming Soon" modals
  (calls, stories, linked devices)
- **Attachments** — images, video, audio, PDF, text and zip files in
  messages (10 MiB cap, member-only downloads)
- **Reactions** — quick-emoji hover picker and toggleable emoji chips
- **Quoted replies** — reply from the hover menu; quotes survive deletion of
  the original
- **Disappearing messages** — per-conversation timers (30 s – 1 week),
  server-enforced sweep with system notices
- **Dark mode** — Signal dark palette, Light/Dark/System, FOUC-free
- **Keyboard shortcuts** — ⌘K search, ⌘N new chat, Alt+↑/↓, `/` composer,
  `?` help
- **Input validation** — every request is constrained at the schema boundary
  (422 with field-level errors): phone numbers normalize to `+1` + 10 digits,
  usernames 3–32 `[a-z0-9._-]`, display names 1–80 chars, message bodies
  1–4000, OTP codes exactly 6 digits, avatar colors restricted to the Signal
  palette, positive integer ids, bounded id lists, settings key/value patterns

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
│   │   ├── core/      config, db session, security (cookie sessions), validators
│   │   ├── models.py  SQLAlchemy schema (docs/schema.md)
│   │   ├── services/  conversation resolution, message/receipt logic
│   │   └── broker.py  in-memory SSE fan-out (per-user queues, multi-session aware)
│   ├── tests/         pytest (auth, CRUD, receipts, SSE, validation, multi-session, e2e)
│   └── seed/          sample-db transform + natural chat corpus
├── deploy/            Dockerfiles, docker-compose.yml, Caddyfile, deploy.sh
└── docs/              schema.md, api.md, bonus-plan.md
```

**Data flow:** REST carries durable operations (auth, contacts, conversation
CRUD, send, receipts). `GET /api/events` streams server→client events
(`message.new`, `message.status`, `typing.update`, `presence.update`,
`conversation.updated`) to every connected session of every recipient.
Typing and presence live only in server memory; messages/receipts are the
durable log the client refetches on reconnect.

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

In production Caddy routes `/api/*` to the backend and everything else to
Next.js (see `deploy/Caddyfile`).

### Seed / demo accounts

`python -m seed.transform` imports the provided sample SQLite dump
(users, contacts, groups, memberships, message timeline), normalizes
identities to the API's rules (phones to `+1` + 10 digits, usernames
slugified), replaces message bodies with natural chat text, remaps statuses
to receipt rows, and adds a demo user with fresh conversations:

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

See **`docs/api.md`** for the full endpoint table, validation rules and SSE
event catalog, or run the backend and open `http://localhost:8000/docs`
(OpenAPI).

## Testing

```bash
cd backend  && .venv/bin/pytest          # 73 tests
cd frontend && npm test                  # vitest: time, status ticks, store, SSE, theme, shortcuts
             && npm run typecheck        # tsc --noEmit
```

Coverage includes: auth/registration flows, contact + conversation CRUD,
idempotent sends, the receipt state machine, group admin guards, input
validation (27 constraint tests), multi-session presence and delivery
(two-tab fan-out), attachments, reactions, replies, disappearing-message
sweeps, and two live-SSE end-to-end flows (core: register → contact → typing →
send → delivered → read; bonus: upload → react → reply → vanish).

## Deployment

`deploy/` contains everything used in production:

- `Dockerfile.backend` / `Dockerfile.frontend` (Next standalone output)
- `docker-compose.yml` — both services on the `web_net` network with a named
  volume for SQLite; the backend seeds the DB on first start
- `Caddyfile` — `signal.rejit.in` routes `/api/*` to the backend (with
  `flush_interval -1` so SSE streams) and the rest to Next.js
- `deploy.sh` — build + push images to Artifact Registry, then pull and start
  the compose stack on the VM

Cloud identifiers (project, region, registry, VM) are **not** in the repo —
copy `deploy/.env.example` to `deploy/.env` (gitignored) and fill in your own
values before deploying. Image references resolve to
`$GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/$GCP_REPO_NAME/signal-{backend,frontend}`.

## Bonus stages — shipped

All optional assignment bonuses are implemented (planning notes in
**`docs/bonus-plan.md`**): attachments, reactions, quoted replies,
disappearing messages, dark mode, responsive polish + keyboard shortcuts.

## Assumptions

- OTP verification is mocked: the code is always `123456`, no SMS is sent.
- Real end-to-end encryption is **not** implemented (per the assignment:
  encryption can be mocked). Nothing is claimed to be encrypted.
- "Online" is derived from active SSE connections; `last_seen_at` updates when
  the user's last session disconnects.
- Voice/video calls, stories, and linked devices are "Coming Soon" placeholders.
- Attachment storage is local disk on the server (`/data/uploads` volume).

## Credits

UI is inspired by Signal's design language (colors, typography, layout
conventions). **No code from Signal's repositories is reused** — the design
tokens and interaction patterns informed an original implementation.
