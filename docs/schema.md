# Database Schema

SQLite (WAL mode), all timestamps are epoch-millisecond integers.
`PRAGMA foreign_keys=ON`. Defined in `backend/app/models.py` (SQLAlchemy 2.0).

## Tables

```sql
users (
  user_id        INTEGER PRIMARY KEY,
  phone_number   TEXT NOT NULL UNIQUE,        -- E.164, mocked
  username       TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  about          TEXT,
  avatar_color   TEXT NOT NULL,               -- Signal palette key, e.g. 'A120'
  avatar_url     TEXT,                        -- NULL (attachments are future work)
  last_seen_at   INTEGER,
  created_at     INTEGER NOT NULL
)

sessions (                                     -- opaque cookie token; real logout
  session_id     TEXT PRIMARY KEY,            -- sha256 of raw token
  user_id        INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  last_used_at   INTEGER,
  revoked_at     INTEGER
)                                              -- INDEX (user_id)

otp_codes (
  otp_id         INTEGER PRIMARY KEY,
  phone_number   TEXT NOT NULL,
  code           TEXT NOT NULL,               -- mocked: always '123456'
  expires_at     INTEGER NOT NULL,
  consumed_at    INTEGER
)                                              -- INDEX (phone_number)

contacts (
  contact_id      INTEGER PRIMARY KEY,
  owner_id        INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  contact_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  nickname        TEXT,                        -- per-owner name override
  created_at      INTEGER NOT NULL,
  UNIQUE (owner_id, contact_user_id),
  CHECK (owner_id <> contact_user_id)
)

conversations (
  conversation_id INTEGER PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('direct','group')),
  title           TEXT,                        -- groups only
  avatar_color    TEXT,                        -- groups only
  direct_key      TEXT UNIQUE,                 -- 'min:max' user ids; NULL for groups
  created_by      INTEGER NOT NULL REFERENCES users(user_id),
  created_at      INTEGER NOT NULL
)

conversation_members (
  conversation_id      INTEGER NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  user_id              INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role                 TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at            INTEGER NOT NULL,
  last_read_message_id INTEGER REFERENCES messages(message_id) ON DELETE SET NULL,
  is_archived          INTEGER NOT NULL DEFAULT 0,
  is_pinned            INTEGER NOT NULL DEFAULT 0,
  is_muted             INTEGER NOT NULL DEFAULT 0,
  disappearing_seconds INTEGER NULL CHECK (disappearing_seconds IS NULL
                        OR disappearing_seconds IN (30,300,3600,86400,604800)),
  PRIMARY KEY (conversation_id, user_id)
)                                              -- INDEX (user_id, is_archived, is_pinned)

messages (
  message_id      INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(user_id),
  client_id       TEXT NOT NULL,               -- client UUID → idempotent send
  body            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','system')),
  created_at      INTEGER NOT NULL,
  reply_to_message_id  INTEGER NULL REFERENCES messages(message_id) ON DELETE SET NULL,
  reply_to_body        TEXT NULL,      -- quote snapshot (survives deletion)
  reply_to_sender_name TEXT NULL,
  UNIQUE (sender_id, client_id)
)                                              -- INDEX (conversation_id, created_at, message_id)

message_receipts (
  message_id   INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,   -- recipient
  delivered_at INTEGER,
  read_at      INTEGER,
  PRIMARY KEY (message_id, user_id)
)                                              -- INDEX (user_id, read_at)

attachments (
  attachment_id INTEGER PRIMARY KEY,
  message_id    INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  storage_path  TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL
)                                             -- INDEX (message_id), INDEX (user_id)

message_reactions (
  reaction_id INTEGER PRIMARY KEY,
  message_id  INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (message_id, user_id, emoji)
)                                             -- INDEX (message_id)

user_settings (
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  key     TEXT NOT NULL,                       -- theme, read_receipts, typing_indicators...
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
)
```

## Design points

- **`direct_key`** (`"12:34"`, sorted user ids) enforces exactly one direct
  thread per pair at the DB level; `POST /api/conversations/direct` is
  idempotent by construction.
- **Message status is derived, never stored on `messages`**: `read` if any
  `read_at`, else `delivered` if any `delivered_at`, else `sent`. The sender's
  own receipt rows are ignored. Avoids UPDATE churn on the hot table.
- **Read cursor** lives on `conversation_members.last_read_message_id` →
  unread count is one query (excludes own messages). Conversation list sorts
  pinned-first then by newest message; no denormalized last-message columns
  to drift.
- **`messages.client_id`** (client-generated UUID, `UNIQUE` with `sender_id`)
  makes retried sends idempotent and lets the client reconcile its optimistic
  bubble with the server copy and any SSE echo.
- **`kind='system'`** renders group events ("X added Y", "X created the group")
  as centered dividers instead of bubbles — no separate events table.
- **`sessions`** stores only a SHA-256 hash of the cookie token; logout sets
  `revoked_at` for real revocation.

## Sample-data mapping

The seed (`backend/seed/transform.py`) imports structure from the provided
sample SQL dump and replaces message bodies with natural chat text
(`backend/seed/corpus.py`):

| Sample | New schema |
|---|---|
| `users` | `users` (phone/username kept, `display_name` derived, deterministic `avatar_color`) |
| `contacts` | `contacts` |
| `groups` + `group_members` | `conversations(type='group')` + `conversation_members` (admin→admin, member/viewer→member) |
| `messages` + `group_chat_messages` | `messages` (bodies replaced, timestamps preserved) |
| `archived_messages` / `pinned_messages` | `conversation_members.is_archived` / `is_pinned` |
| sample `status` values | `message_receipts`: completed→read, active→delivered, pending/cancelled→no receipt |

Out of scope (dropped): `admin_audit_log`, `admins`, `spam_reports`,
`user_badges`, `user_activity_log`, `two_factor_authentication`,
`user_devices`, `voice_messages`, `message_history`, `group_invitations`,
`invitation_links`, `group_media`, `group_settings`, `*_mentions`,
`notifications` (toasts are ephemeral UI).
