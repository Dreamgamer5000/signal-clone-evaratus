# Signal Clone (signal-clone-evaratus)

A functional clone of the Signal messaging application — mocked phone/OTP auth,
contacts, real-time 1:1 and group chats with delivery/read receipts, typing
indicators, and a Signal-faithful UI.

Full documentation lives in `docs/` and is mirrored in this README (see
"Database schema" and "API overview" below).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, zustand |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Database | SQLite (WAL) |
| Real-time | Server-Sent Events (`GET /api/events`) + REST |
| Deploy | Docker → GCP Artifact Registry → VM behind Caddy at `signal.rejit.in` |

## Development setup

See `docs/` and the run commands below. Details are completed during build.

## Database schema

See `docs/schema.md`.

## API overview

See `docs/api.md`.
