# Signal Clone — Bonus Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the assignment's optional bonuses — attachments, reactions,
reply/quote, disappearing messages, dark mode, responsive polish + keyboard
shortcuts — on top of the working core app.

**Architecture:** Additive only. Each stage extends the existing FastAPI +
SSE + zustand design with new tables/endpoints/events and matching UI; no
restructuring of shipped code. Stages are **independently shippable** —
execute them in order, stop and demo after each.

**Tech Stack:** unchanged (Next.js 15 / Tailwind 4 / zustand · FastAPI /
SQLAlchemy 2.0 / SQLite · SSE · Docker/Caddy).

**Spec:** `docs/superpowers/specs/2026-10-07-signal-clone-design.md` (base
design — still normative for everything not overridden here), assignment
bonus list. This plan is the spec for the bonus layer.

**Execution method:** subagent-driven, as before — mimo orchestrates and owns
UI-heavy stages (B1-UI, B2-UI, B3-UI, B5, B6), GLM-5.3-Flash executes
mechanical backend pieces (B1-API, B2-API, B3-API, B4-API, B7). Commit per
task (`feat:`/`fix:`/`test:`), one stage = one deployable increment.

---

## Global Constraints (inherited + bonus)

- Everything in the base plan's Global Constraints stands (repo root, epoch-ms
  timestamps, cookie sessions, conventional commits, test gates before every
  commit, Signal design tokens, no Signal code copied).
- Input validation at the schema boundary for every new field (422 on
  violation) — consistent with `app/core/validators.py`.
- New SQL tables must carry the same integrity style: FKs with
  `ON DELETE CASCADE`/`SET NULL`, `UNIQUE` where identity is implied,
  `CHECK` for enums, indexes on foreign/ordering columns.
- Attachment storage: local filesystem under `/data/uploads` (already a named
  volume), max **10 MiB** per file, mime allow-list (below). No public
  unauthenticated file routes — downloads require conversation membership.
- Disappearing timers allowed: `30, 300, 3600, 86400, 604800` seconds or NULL
  (off). Deletion is conversation-wide and server-enforced.
- Reactions: one reaction per (message, user, emoji); emoji restricted to a
  fixed 32-emoji allow-list.
- Dark theme must not flash light on load (theme applied before first paint).
- `cd backend && .venv/bin/pytest -q` and
  `cd frontend && npx vitest run && npx tsc --noEmit && npm run build` must
  pass before every commit.

## Review Focus (bonus-specific failure modes)

1. **Attachment authz / path traversal** — `storage_path` is server-generated
   (uuid), never client-supplied; download must 403 for non-members and 404
   for unknown ids. Pin: B1 tests.
2. **Oversized / wrong-type uploads** — 10 MiB hard cap (413) and mime
   allow-list (415). Pin: B1 tests.
3. **Disappearing messages vs. receipts/unread** — deleting a message must
   cascade receipts and leave unread counts/last-message previews consistent
   (no dangling `last_read_message_id` refs). Pin: B4 tests.
4. **Reaction toggle races** — double-click must not duplicate rows (UNIQUE)
   or 500; toggle semantics idempotent. Pin: B2 tests.
5. **Quote integrity after deletion** — replies keep a snapshot of the quoted
   text so a deleted/vanished original renders "deleted" gracefully instead
   of crashing. Pin: B3 tests.
6. **Dark mode FOUC** — first paint must already be dark when theme=dark
   (inline pre-paint script). Pin: B5 review + build check.

---

## Stage B1 — Attachments (images/files)

### Task B1.1: Attachment model + upload/download API *(GLM)*

**Files:**
- Create: `backend/tests/test_attachments.py`
- Modify: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/api/messages.py`, `backend/app/api/attachments.py` (new), `backend/app/main.py`, `backend/app/core/validators.py`

**Interfaces:**
- Produces: `attachments` table (DDL below); `POST /api/conversations/{id}/messages` accepts **multipart/form-data** (`client_id`, optional `body`, optional `file`) in addition to JSON; `MessageOut.attachments: list[AttachmentOut]`; `GET /api/attachments/{attachment_id}/file` streams the file (member-only).

```sql
attachments (
  attachment_id INTEGER PRIMARY KEY,
  message_id    INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,               -- sanitized original name
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  storage_path  TEXT NOT NULL UNIQUE,        -- server-generated: "{user_id}/{uuid}{ext}"
  created_at    INTEGER NOT NULL
)                                             -- INDEX (message_id), INDEX (user_id)
```

- [ ] **Step 1: failing tests** — `tests/test_attachments.py`

```python
import io
from fastapi.testclient import TestClient
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


def test_upload_image_message(test_engine):
    a, b, cid = boot(test_engine)
    r = a.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-attach-01", "body": "look at this"},
        files={"file": ("pic.png", io.BytesIO(b"\x89PNG fake"), "image/png")},
    )
    assert r.status_code == 200
    atts = r.json()["attachments"]
    assert len(atts) == 1
    assert atts[0]["file_name"] == "pic.png"
    assert atts[0]["mime_type"] == "image/png"
    got = b.get(f"/api/attachments/{atts[0]['attachment_id']}/file")
    assert got.status_code == 200
    assert got.content.startswith(b"\x89PNG")


def test_download_requires_membership(test_engine):
    a, b, cid = boot(test_engine)
    att_id = a.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-attach-02"},
        files={"file": ("n.txt", io.BytesIO(b"hi"), "text/plain")},
    ).json()["attachments"][0]["attachment_id"]
    eve = TestClient(create_app())
    eve.post("/api/auth/register", json={
        "phone_number": "+15550000003", "username": "eve",
        "display_name": "Eve", "avatar_color": "A130"})
    assert eve.get(f"/api/attachments/{att_id}/file").status_code == 403
    assert a.get("/api/attachments/999999/file").status_code == 404


def test_upload_limits(test_engine):
    a, b, cid = boot(test_engine)
    big = io.BytesIO(b"x" * (10 * 1024 * 1024 + 1))
    assert a.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-attach-03"},
        files={"file": ("big.bin", big, "application/octet-stream")},
    ).status_code == 415          # mime not allow-listed
    exe = io.BytesIO(b"MZ")
    assert a.post(
        f"/api/conversations/{cid}/messages",
        data={"client_id": "cid-attach-04"},
        files={"file": ("x.exe", exe, "application/x-msdownload")},
    ).status_code == 415
```

- [ ] **Step 2: verify fail** — `cd backend && .venv/bin/pytest tests/test_attachments.py -v` (404/422s)

- [ ] **Step 3: implement**
  - `validators.py`: `ALLOWED_ATTACHMENT_MIMES` (union of `image/*` raster
    (`image/png image/jpeg image/gif image/webp`), `video/mp4`, `audio/mpeg`,
    `application/pdf`, `text/plain`, `application/zip`), `MAX_ATTACHMENT_BYTES
    = 10 * 1024 * 1024`, `safe_file_name(name)` (strip path separators, cap
    120 chars).
  - `models.py`: `Attachment` per DDL.
  - `api/messages.py`: `send_message` accepts `Request` content-type switch —
    JSON body (existing) **or** `UploadFile` + form fields. Rules: mime must be
    allow-listed else **415**; size streamed to disk with cap else **413**;
    `storage_path = f"{user.user_id}/{uuid4().hex}{ext}"` under
    `UPLOADS_DIR` (settings `UPLOADS_DIR` default `/data/uploads`, local dev
    `./uploads`); row written with the message.
  - `api/attachments.py`: `GET /{attachment_id}/file` → resolve attachment →
    message → conversation → `_require_membership` (403 otherwise, 404 if
    missing) → `FileResponse` with original `file_name` and `mime_type`.
  - `schemas.py`: `AttachmentOut {attachment_id, file_name, mime_type,
    size_bytes}`; `MessageOut.attachments: list[AttachmentOut] = []`.
  - `settings.py` (core config): `UPLOADS_DIR: str = "./uploads"`.

- [ ] **Step 4: verify pass** — full backend suite green (50 + 3 new)

- [ ] **Step 5: commit** — `git add backend && git commit -m "feat: attachment upload/download API with mime allow-list and 10MiB cap"`

### Task B1.2: Composer upload + bubble rendering *(mimo)*

**Files:**
- Modify: `frontend/lib/api.ts`, `frontend/lib/types.ts`, `frontend/components/Composer.tsx`, `frontend/components/MessageBubble.tsx`, `frontend/components/ChatPane.tsx`

**Interfaces:**
- Consumes: B1.1 endpoints; `MessageOut.attachments`.
- Produces: `sendMessageWithFile(id, clientId, body, file)` (multipart fetch);
  Composer's attach button opens a file picker (images + docs), shows the
  chosen file chip, sends on submit; `MessageBubble` renders `image/*`
  thumbnails (max-width 320px, rounded) and file rows (icon + name + size)
  above the text; tap opens `GET /api/attachments/{id}/file` in a new tab.

- [ ] **Step 1: types + api client** — add `Attachment` to `types.ts`
  (`attachments?: Attachment[]` on `Message`), `sendMessageWithFile` in `api.ts`
  using `FormData` + `credentials: 'include'`.
- [ ] **Step 2: Composer** — replace the "Attachments — coming soon" toast with
  `<input type="file" hidden>`; on file select show a chip (name + ✕); onSend
  gains optional `file`.
- [ ] **Step 3: MessageBubble** — render attachments block before text.
- [ ] **Step 4: verify** — `npx vitest run && npx tsc --noEmit && npm run build`
- [ ] **Step 5: commit** — `git add frontend && git commit -m "feat: attachment upload in composer + image/file bubbles"`

### Task B1.3: Storage wiring in deploy *(mimo)*
- [ ] `deploy/docker-compose.yml` already persists `/data` (`signal_data` volume) — set `UPLOADS_DIR=/data/uploads` in the backend env block.
- [ ] Rebuild + push images, redeploy, verify upload → thumbnail → download on `signal.rejit.in`.
- [ ] commit — `chore: attachment storage env + deploy`

---

## Stage B2 — Reactions

### Task B2.1: Reaction model + toggle API *(GLM)*

**Files:**
- Create: `backend/tests/test_reactions.py`
- Modify: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/api/messages.py`, `backend/app/main.py`, `backend/app/core/validators.py`, `backend/app/broker.py` (no change needed if publish fits)

**Interfaces:**

```sql
message_reactions (
  reaction_id INTEGER PRIMARY KEY,
  message_id  INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (message_id, user_id, emoji)
)                                             -- INDEX (message_id)
```

- `validators.py`: `REACTION_EMOJI` allow-list (32 emoji: 👍 ❤️ 😂 😮 😢 😡 🎉 🙏 👀 💯 🔥 ✅ 👏 😊 🤔 😴 🥳 😎 🤝 👋 🫡 💪 🎯 🚀 ☕ 🍕 🌟 😭 🤗 😅 🙃 🫶) and `validate_emoji` (must be member of the list).
- `POST /api/conversations/{id}/messages/{message_id}/reactions` `{emoji}` → 200 `ReactionOut {emoji, user_ids}` — upsert semantics (repeat = no-op).
- `DELETE /api/conversations/{id}/messages/{message_id}/reactions/{emoji}` → 204 idempotent.
- `MessageOut.reactions: list[ReactionOut] = []`.
- SSE event `reaction.updated` `{conversation_id, message_id, emoji, user_ids}` published to `member_ids`.

- [ ] **Step 1: failing tests** — add/toggle/validate/non-member cases:

```python
def test_reaction_add_and_remove(test_engine):
    a, b, cid = boot(test_engine)                      # helper as in B1
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
```

- [ ] **Step 2–4** as usual (fail → implement → full suite 53+ green).
- [ ] **Step 5: commit** — `feat: message reactions API with emoji allow-list`

### Task B2.2: Reaction UI *(mimo)*
- Hover/long-press menu on `MessageBubble`: **Reply** (B3) + quick-emoji row
  (👍 ❤️ 😂 😮 😢 😡) + "…" opening the full 32-emoji picker.
- Reaction chips row under the bubble (count + who on hover/title); clicking a
  chip toggles *your* reaction; chips styled per Signal (pill with emoji +
  count, ultramarine border when you reacted).
- Store: `applyReaction(payload)` reducer; SSE wiring in `ChatShell`.
- [ ] verify + commit — `feat: reaction picker and chips on message bubbles`

---

## Stage B3 — Reply / quote

### Task B3.1: Reply fields + snapshot quoting *(GLM)*

**Files:**
- Modify: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/api/messages.py`, tests

**Interfaces:**
- `messages` gains three columns (recreate-DB migration is acceptable — dev
  data is disposable; document in commit):

```sql
reply_to_message_id INTEGER NULL REFERENCES messages(message_id) ON DELETE SET NULL,
reply_to_body       TEXT NULL,      -- snapshot of the original at reply time
reply_to_sender_name TEXT NULL      -- snapshot of the original sender
```

- `MessageIn` gains `reply_to_id: PositiveId | None`; send validates the
  target exists **in the same conversation** (404 else), snapshots its body
  (truncate to 200 chars) + sender display name, stores all three columns.
- `MessageOut` gains `reply_to: ReplyPreview | None` =
  `{message_id, sender_name, body, deleted: bool}` where `deleted = body is
  None` (SET NULL case renders "Original message deleted").
- [ ] **Step 1: failing tests** — reply stores preview; reply to foreign
  conversation message → 404; reply to missing id → 404; deleting the target
  keeps the preview but nulls `reply_to_message_id`.
- [ ] **Step 2–4** implement + full suite green.
- [ ] **Step 5: commit** — `feat: quoted replies with snapshot previews`

### Task B3.2: Reply UI *(mimo)*
- Hover menu "Reply" sets `replyingTo` state in ChatPane; Composer shows a
  quote strip (✕ to cancel); `sendMessage` includes `reply_to_id`.
- `MessageBubble` renders a quoted block (left ultramarine border, sender name
  + truncated body, muted background); clicking scrolls to the original
  (scroll-into-view by `data-message-id`), works even when the original is
  deleted (renders "Original message deleted").
- [ ] verify + commit — `feat: reply composer strip and quoted bubbles`

---

## Stage B4 — Disappearing messages (functional)

### Task B4.1: Timer setting + server-side sweep *(GLM)*

**Files:**
- Modify: `backend/app/models.py`, `backend/app/api/conversations.py`, `backend/app/main.py` (startup task), `backend/app/services/ephemeral.py` (new), tests

**Interfaces:**
- `conversations.disappearing_seconds INTEGER NULL CHECK (disappearing_seconds IN (30,300,3600,86400,604800))`
- `PATCH /api/conversations/{id}` accepts `disappearing_seconds` (any member —
  Signal semantics); writes a `kind='system'` message
  (`"Alice set disappearing messages to 5 minutes"` / `"… turned them off"`)
  and publishes `conversation.updated`.
- `ConversationSummary`/`ConversationOut` include `disappearing_seconds`.
- `services/ephemeral.py`: `sweep_once(db) -> int` deletes messages where the
  conversation has a timer and `created_at < now_ms() - seconds*1000`
  (receipts cascade). FastAPI lifespan runs `sweep_loop()` every 60 s
  (`asyncio.create_task`); also call `sweep_once` on app start.
- Frontend list/thread refetch already reacts to `conversation.updated`; the
  sweep itself broadcasts `conversation.updated` per affected conversation so
  open threads refresh.

- [ ] **Step 1: failing tests**

```python
def test_disappearing_messages_sweep(test_engine, tmp_path):
    a, b, cid = boot(test_engine)
    assert a.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": 30}).status_code == 200
    mid = a.post(f"/api/conversations/{cid}/messages",
                 json={"client_id": "cid-van-01", "body": "blink"}).json()["message_id"]
    # backdate the message beyond the window, then sweep
    from app.core.db import SessionLocal
    from app.models import Message
    from app.core.security import now_ms
    db = SessionLocal()
    db.get(Message, mid).created_at = now_ms() - 60_000
    db.commit(); db.close()
    from app.services.ephemeral import sweep_once
    removed = sweep_once(SessionLocal())
    assert removed == 1
    assert a.get(f"/api/conversations/{cid}/messages").json() == []


def test_no_timer_keeps_messages(test_engine):
    a, b, cid = boot(test_engine)
    a.post(f"/api/conversations/{cid}/messages", json={"client_id": "cid-van-02", "body": "stay"})
    from app.services.ephemeral import sweep_once
    from app.core.db import SessionLocal
    assert sweep_once(SessionLocal()) == 0
```

- [ ] **Step 2–4** implement + green. NOTE: patching `Message.created_at`
  above is test-only manipulation of persisted state (allowed — it is the DB,
  not the clock).
- [ ] **Step 5: commit** — `feat: disappearing messages with server-side sweep and system notices`

### Task B4.2: Disappearing UI *(mimo)*
- Chat header timer icon (only when a timer is set it shows filled); modal
  picker ("Off / 30 s / 5 min / 1 hr / 1 day / 1 week") calling PATCH.
- System messages render centered (already supported via `kind='system'`).
- Thread banner "Disappearing messages: 5 minutes" while timer active.
- [ ] verify + commit — `feat: disappearing-message picker and banners`

---

## Stage B5 — Dark mode *(mimo)*

**Files:**
- Modify: `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/settings/page.tsx`, `frontend/lib/theme.ts` (new), `frontend/lib/__tests__/theme.test.ts` (new)

**Interfaces:**
- `lib/theme.ts` — `resolveTheme(setting: 'light'|'dark'|'system', prefersDark: boolean): 'light'|'dark'` (pure, unit-tested).
- `globals.css` — `[data-theme="dark"]` overrides for every token: backgrounds
  `#121212`/`#1b1b1b`/`#262626`, text `#f6f6f6`/`#c6c6c6`, borders
  `#2e2e2e`, incoming bubble `#2e2e2e`, ultramarine unchanged, shadows
  dropped (Signal dark style).
- `layout.tsx` — inline `<script>` before hydration reading
  `localStorage.theme` (seeded from `user_settings.theme` after login) and
  setting `document.documentElement.dataset.theme` (kills FOUC); `system`
  listens to `matchMedia('(prefers-color-scheme: dark)')`.
- Settings → Appearance gets a **Theme** row: Light / Dark / System segmented
  control persisting via `PATCH /api/settings {theme}`.
- [ ] **Step 1: failing test** — `theme.test.ts`: system+prefersDark→dark,
  system+no-prefers→light, explicit dark wins over prefersLight.
- [ ] **Step 2–4** implement, verify (vitest/tsc/build), commit —
  `feat: dark mode with Signal dark palette and FOUC-free theme application`

---

## Stage B6 — Keyboard shortcuts + responsive polish *(mimo)*

**Files:**
- Create: `frontend/lib/shortcuts.ts`, `frontend/lib/__tests__/shortcuts.test.ts`, `frontend/components/ShortcutsModal.tsx`
- Modify: `frontend/app/chats/layout.tsx`, `frontend/components/ChatPane.tsx`, `frontend/components/ConversationList.tsx`, `frontend/app/globals.css`

**Interfaces:**
- `shortcuts.ts` — pure `matchShortcut(e: KeyboardEvent, platform: 'mac'|'other'): Shortcut | null` with: `send` (Enter, Shift+Enter = newline handled by Composer), `close` (Escape), `search` (Ctrl/Cmd+K), `new-chat` (Ctrl/Cmd+N), `next-chat`/`prev-chat` (Alt+↓ / Alt+↑), `focus-composer` (/), `show-help` (?).
- `ChatShell` installs one keydown listener dispatching those actions
  (open/close modals, move selection through `sortConversations`, focus
  `textarea`), ignoring keys while typing except Escape/Enter.
- `ShortcutsModal` lists the bindings (opened via `?` and a settings row).
- Responsive polish checklist (manual QA + fixes): mobile safe-area padding
  (`env(safe-area-inset-*)` on header/composer), ≥44px tap targets, composer
  stays above mobile keyboard (`dvh` heights instead of `vh`), list press
  states (`active:bg-gray-05`), back button returns to list on mobile.
- [ ] **Step 1: failing tests** — `shortcuts.test.ts` maps representative
  combos (Cmd+K vs Ctrl+K, Shift+Enter not 'send', '?' only without
  modifiers).
- [ ] **Step 2–4** implement + verify + commit —
  `feat: keyboard shortcuts, shortcuts modal, responsive polish`

---

## Stage B7 — Integration, deploy, docs *(GLM + mimo)*

- [ ] **Task B7.1:** e2e test extending `test_e2e_flow.py` — upload → reaction
  → reply → disappearing (30s timer with backdated sweep) over live HTTP+SSE,
  asserting the SSE events (`reaction.updated`, `conversation.updated`).
- [ ] **Task B7.2:** run both suites + `next build`; fix-forward.
- [ ] **Task B7.3:** rebuild/push both images (set `UPLOADS_DIR=/data/uploads`),
  redeploy (`deploy.sh`), verify live on `signal.rejit.in` (upload image in a
  chat, react, reply, set 30s timer and watch it vanish, toggle dark mode).
- [ ] **Task B7.4:** update `README.md` (features, roadmap → shipped),
  `docs/api.md` (new endpoints/events), `docs/schema.md` (new tables/columns);
  final commit `docs: bonus stages shipped` + push.

---

## Self-Review Notes

- **Spec coverage:** every assignment bonus item maps to a stage —
  attachments (B1), reactions (B2), reply/quote (B3), disappearing (B4),
  dark mode (B5), responsive + keyboard shortcuts (B6). Each stage ends in
  tests + commit + (B7) deploy/docs.
- **Type consistency:** `AttachmentOut`, `ReactionOut`, `ReplyPreview` are
  defined once in B*1 Interfaces and reused verbatim by the UI tasks;
  `conversation.updated`/`reaction.updated` reuse the existing SSE envelope
  (`{"type": ..., "payload": {...}}`).
- **Review Focus wiring:** line 1–2 → B1 tests; line 3 → B4 sweep test with
  receipts-count assertion; line 4 → B2 idempotent re-add test; line 5 → B3
  deleted-target test; line 6 → B5 pre-paint script + build check.
- **Migration note:** B3 alters `messages` (3 columns). Dev DBs are
  disposable — `seed.transform` rebuilds them; production reseeds via volume
  reset. No migration framework needed (consistent with the base plan).
