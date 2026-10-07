# API Overview

Base path `/api`. JSON in/out. All endpoints cookie-authenticated
(`sig_session`, HttpOnly) except the auth endpoints. Errors:
`{"detail": "..."}` with 4xx/5xx.

Input is validated at the schema boundary (422 on violation): phone numbers
normalize to `+1` + 10 digits (accepts `5550000001`, `15550000001`,
`+1 555-000-0001`), usernames are 3–32 chars `[a-z0-9._-]` starting/ending
alphanumeric (lowercased), display names 1–80 chars, message bodies 1–4000,
OTP codes exactly 6 digits, avatar colors restricted to the Signal palette,
all ids are positive integers, and `user_ids`/`message_ids` are 1–256-entry
lists of positive integers. Group titles and settings keys/values are
length- and pattern-checked.

## Auth (mocked OTP)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/otp/start` | `{phone_number}` | `{"otp_sent": true}` |
| POST | `/auth/otp/verify` | `{phone_number, code}` | `{"user"}` + cookie, or `428` (needs registration), `401` (bad code) |
| POST | `/auth/register` | `{phone_number, username, display_name, avatar_color}` | `{"user"}` + cookie; `409` on duplicate |
| GET | `/auth/me` | — | `{"user"}` |
| POST | `/auth/logout` | — | `204` (revokes session) |

The fixed demo OTP is `123456`.

## Users & contacts

| Method | Path | Notes |
|---|---|---|
| GET | `/users?q=` | search username/display name, limit 20, excludes self |
| PATCH | `/users/me` | `{display_name?, about?, avatar_color?}` |
| GET | `/contacts` | contacts with nested `user` |
| POST | `/contacts` | `{phone_or_username, nickname?}`; 404 unknown, 409 duplicate, 400 self |
| DELETE | `/contacts/{id}` | 204 |

## Conversations

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations?archived=false` | summaries: peer/title, last message, unread count, pinned/archived/muted |
| POST | `/conversations/direct` | `{user_id}` — idempotent via `direct_key` |
| POST | `/conversations/group` | `{title, user_ids[]}` — creator is admin |
| GET | `/conversations/{id}` | summary + `members` |
| PATCH | `/conversations/{id}` | `{title?, is_pinned?, is_archived?, is_muted?}` (title: admin only) |

## Messages & receipts

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations/{id}/messages?before_id=&limit=50` | newest page first (chat opens at the bottom); `before_id` scrolls up |
| POST | `/conversations/{id}/messages` | `{client_id, body}` — idempotent on `(sender, client_id)`; response is the *sent* ack |
| POST | `/conversations/{id}/receipts` | `{message_ids[], status: delivered\|read}` — only others' messages; `read` also advances the read cursor |
| POST | `/conversations/{id}/typing` | `{active: bool}` |

## Group membership (admin only)

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations/{id}/members` | `[Member]` with role badges |
| POST | `/conversations/{id}/members` | `{user_id}`; writes a system message |
| DELETE | `/conversations/{id}/members/{user_id}` | 409 when last admin/member |
| PATCH | `/conversations/{id}/members/{user_id}` | `{role}`; 409 demoting last admin |

## Settings

| Method | Path | Notes |
|---|---|---|
| GET | `/settings` | `{key: value}` |
| PATCH | `/settings` | upsert `{key: value, ...}` |

## Events (SSE)

`GET /api/events` — `text/event-stream`, cookie auth. Heartbeat comment every
20 s. Frames:

```
event: message.new
data: {"type": "message.new", "payload": { ...message... }}
```

| Event | Payload | Meaning |
|---|---|---|
| `message.new` | message (+`conversation_id`) | new message (also echoed to the sender's other tabs) |
| `message.status` | `{conversation_id, message_ids, user_id, status}` | delivered/read tick update |
| `typing.update` | `{conversation_id, user_id, active}` | typing indicator |
| `presence.update` | `{user_id, online, last_seen_at}` | online/last seen |
| `conversation.updated` | `{conversation_id, reason}` | membership/title changed |

## Message status state machine

```
sending (optimistic, client_id, clock icon)
  → sent      (POST 201 persisted — single check)
  → delivered (recipient's client POSTs receipt — double check)
  → read      (thread open, POSTs read receipt — double blue check)
```

Offline recipients stay `sent` until their client fetches/receives and posts
the `delivered` receipt. Status is derived from `message_receipts`, never
stored on `messages`.
