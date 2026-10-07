"""Build the app database from the bundled sample Signal SQLite dump."""

from __future__ import annotations

import argparse
import random
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401
from app.core.db import Base
from app.core.validators import normalize_phone
from app.models import (
    Contact,
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    User,
)
from seed.corpus import for_message

SAMPLE_SQL = Path(__file__).resolve().parent / "sample" / "signal-database-sqlite.sql"

AVATAR_KEYS = [
    "A100",
    "A110",
    "A120",
    "A130",
    "A140",
    "A150",
    "A160",
    "A170",
    "A180",
    "A190",
    "A200",
    "A210",
]

RNG_SEED = 12345
DAY_MS = 24 * 60 * 60 * 1000
NOW_MS = int(datetime(2026, 10, 7, 4, 0, tzinfo=timezone.utc).timestamp() * 1000)
DEMO_CREATED_MS = int(datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
DEMO_PHONE = "+15550000001"
DEMO_AVATAR = "A120"
DEMO_CONTACT_COUNT = 6
DEMO_GROUP_COUNT = 3
RECEIPT_STATES = ("completed", "active", "pending")


def _parse_ts(value: str) -> int:
    dt = datetime.fromisoformat(value.replace(" ", "T")).replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _avatar_for(entity_id: int) -> str:
    return AVATAR_KEYS[entity_id % len(AVATAR_KEYS)]


def _receipt_values(status: str, created_at: int) -> tuple[int | None, int | None]:
    if status == "completed":
        return created_at + 30_000, created_at + 60_000
    if status == "active":
        return created_at + 30_000, None
    return None, None


def _add_receipts(
    db, message: Message, recipient_ids, status: str
) -> None:
    delivered_at, read_at = _receipt_values(status, message.created_at)
    for uid in recipient_ids:
        if uid == message.sender_id:
            continue
        db.add(
            MessageReceipt(
                message_id=message.message_id,
                user_id=uid,
                delivered_at=delivered_at,
                read_at=read_at,
            )
        )


def _timeline(rng: random.Random, count: int, start_ms: int, end_ms: int) -> list[int]:
    step = (end_ms - start_ms) // (count + 1)
    return [start_ms + (i + 1) * step + rng.randrange(step) for i in range(count)]


def _reset_file(out_path: str) -> None:
    p = Path(out_path)
    for candidate in (p, Path(f"{p}-wal"), Path(f"{p}-shm")):
        if candidate.exists():
            candidate.unlink()


def _slug_username(raw: str, uid: int, seen: set[str]) -> str:
    """Sample usernames are multi-word; slugify to API-legal [a-z0-9._-], 3-32 chars."""
    slug = re.sub(r"[^a-z0-9._-]+", ".", (raw or "").lower())
    slug = re.sub(r"[._-]{2,}", ".", slug).strip(".-_")
    if not slug or not slug[0].isalnum():
        slug = f"u{slug}"
    if len(slug) < 3:
        slug = f"{slug}{uid}"
    slug = slug[:32]
    candidate, n = slug, 2
    while candidate in seen:
        suffix = f".{n}"
        candidate = f"{slug[: 32 - len(suffix)]}{suffix}"
        n += 1
    seen.add(candidate)
    return candidate


def _unique_phone(original: str, uid: int, seen: set[str]) -> str:
    phone = normalize_phone(original)
    if phone not in seen:
        seen.add(phone)
        return phone
    # duplicate sample rows: synthesize a unique, still-valid US number
    candidate = f"+1{9000000000 + uid}"
    while candidate in seen:
        candidate = f"+1{9000000000 + uid + len(seen)}"
    seen.add(candidate)
    return candidate


def _seed_sample(db, sample: sqlite3.Connection, rng: random.Random):
    users: dict[int, User] = {}
    seen_phones: set[str] = set()
    seen_usernames: set[str] = set()
    for row in sample.execute(
        "SELECT user_id, created_at, phone_number, username FROM users ORDER BY user_id"
    ):
        uid = row["user_id"]
        phone = _unique_phone(row["phone_number"], uid, seen_phones)
        username = _slug_username(row["username"], uid, seen_usernames)
        user = User(
            user_id=uid,
            phone_number=phone,
            username=username,
            display_name=row["username"].title(),
            about=None,
            avatar_color=_avatar_for(uid),
            avatar_url=None,
            last_seen_at=None,
            created_at=_parse_ts(row["created_at"]),
        )
        db.add(user)
        users[uid] = user
    db.flush()

    seen_pairs: set[tuple[int, int]] = set()
    for row in sample.execute(
        "SELECT contact_id, contact_user_id, created_at, user_id FROM contacts ORDER BY contact_id"
    ):
        owner, other = row["user_id"], row["contact_user_id"]
        if owner == other or (owner, other) in seen_pairs:
            continue
        seen_pairs.add((owner, other))
        db.add(
            Contact(
                owner_id=owner,
                contact_user_id=other,
                nickname=None,
                created_at=_parse_ts(row["created_at"]),
            )
        )

    members_by_group: dict[int, list] = {}
    for row in sample.execute(
        "SELECT group_member_id, group_id, joined_at, role, user_id"
        " FROM group_members ORDER BY group_member_id"
    ):
        members_by_group.setdefault(row["group_id"], []).append(row)

    fallback_creator = min(users)
    group_convs: dict[int, int] = {}
    conv_types: dict[int, str] = {}
    member_index: dict[tuple[int, int], ConversationMember] = {}

    for row in sample.execute(
        "SELECT group_id, created_at, group_name FROM groups ORDER BY group_id"
    ):
        gid = row["group_id"]
        mem_rows = members_by_group.get(gid, [])
        admin = next((m for m in mem_rows if m["role"] == "admin"), None)
        creator = (
            (admin if admin is not None else mem_rows[0])["user_id"]
            if mem_rows
            else fallback_creator
        )
        conv = Conversation(
            type="group",
            title=row["group_name"],
            avatar_color=_avatar_for(gid),
            direct_key=None,
            created_by=creator,
            created_at=_parse_ts(row["created_at"]),
        )
        db.add(conv)
        db.flush()
        group_convs[gid] = conv.conversation_id
        conv_types[conv.conversation_id] = "group"
        seen_members: set[int] = set()
        for m in mem_rows:
            uid = m["user_id"]
            if uid in seen_members:
                continue
            seen_members.add(uid)
            member = ConversationMember(
                conversation_id=conv.conversation_id,
                user_id=uid,
                role="admin" if m["role"] == "admin" else "member",
                joined_at=_parse_ts(m["joined_at"]),
                is_archived=0,
                is_pinned=0,
                is_muted=0,
            )
            db.add(member)
            member_index[(conv.conversation_id, uid)] = member
    db.flush()

    direct_convs: dict[str, int] = {}
    msg_meta: dict[int, tuple[int, int]] = {}

    for row in sample.execute(
        "SELECT message_id, receiver_id, sender_id, sent_at, status"
        " FROM messages ORDER BY sent_at, message_id"
    ):
        sender, receiver = row["sender_id"], row["receiver_id"]
        ts = _parse_ts(row["sent_at"])
        key = f"{min(sender, receiver)}:{max(sender, receiver)}"
        conv_id = direct_convs.get(key)
        if conv_id is None:
            conv = Conversation(
                type="direct",
                title=None,
                avatar_color=None,
                direct_key=key,
                created_by=sender,
                created_at=ts,
            )
            db.add(conv)
            db.flush()
            conv_id = conv.conversation_id
            direct_convs[key] = conv_id
            conv_types[conv_id] = "direct"
            for uid in dict.fromkeys((sender, receiver)):
                member = ConversationMember(
                    conversation_id=conv_id,
                    user_id=uid,
                    role="member",
                    joined_at=ts,
                    is_archived=0,
                    is_pinned=0,
                    is_muted=0,
                )
                db.add(member)
                member_index[(conv_id, uid)] = member
        message = Message(
            conversation_id=conv_id,
            sender_id=sender,
            client_id=f"seed-msg-{row['message_id']}",
            body=for_message(rng, False, "direct"),
            kind="text",
            created_at=ts,
        )
        db.add(message)
        db.flush()
        _add_receipts(db, message, [receiver], row["status"])
        msg_meta[row["message_id"]] = (conv_id, receiver)

    for row in sample.execute(
        "SELECT group_message_id, group_id, sender_id, sent_at"
        " FROM group_chat_messages ORDER BY sent_at, group_message_id"
    ):
        conv_id = group_convs.get(row["group_id"])
        if conv_id is None:
            continue
        sender = row["sender_id"]
        ts = _parse_ts(row["sent_at"])
        message = Message(
            conversation_id=conv_id,
            sender_id=sender,
            client_id=f"seed-gcm-{row['group_message_id']}",
            body=for_message(rng, False, "group"),
            kind="text",
            created_at=ts,
        )
        db.add(message)
        db.flush()
        recipients = [uid for (cid, uid) in member_index if cid == conv_id]
        _add_receipts(db, message, recipients, "pending")

    def flag_members(sample_message_id: int, attr: str) -> None:
        meta = msg_meta.get(sample_message_id)
        if meta is None:
            return
        conv_id, receiver = meta
        if conv_types.get(conv_id) == "direct":
            member = member_index.get((conv_id, receiver))
            if member is not None:
                setattr(member, attr, 1)
        else:
            for (cid, _uid), member in member_index.items():
                if cid == conv_id:
                    setattr(member, attr, 1)

    for row in sample.execute(
        "SELECT message_id FROM archived_messages ORDER BY archived_message_id"
    ):
        flag_members(row["message_id"], "is_archived")
    for row in sample.execute(
        "SELECT message_id FROM pinned_messages ORDER BY pinned_message_id"
    ):
        flag_members(row["message_id"], "is_pinned")

    return {
        "users": users,
        "members_by_group": members_by_group,
        "group_convs": group_convs,
        "member_index": member_index,
    }


def _seed_demo(db, sample: sqlite3.Connection, rng: random.Random, state) -> None:
    users = state["users"]
    members_by_group = state["members_by_group"]
    group_convs = state["group_convs"]
    member_index = state["member_index"]

    demo_id = max(users) + 1
    demo = User(
        user_id=demo_id,
        phone_number=DEMO_PHONE,
        username="you",
        display_name="You",
        about=None,
        avatar_color=DEMO_AVATAR,
        avatar_url=None,
        last_seen_at=None,
        created_at=DEMO_CREATED_MS,
    )
    db.add(demo)

    contact_ids = sorted(users)[:DEMO_CONTACT_COUNT]
    for uid in contact_ids:
        db.add(
            Contact(
                owner_id=demo_id,
                contact_user_id=uid,
                nickname=None,
                created_at=DEMO_CREATED_MS,
            )
        )
    db.flush()

    window_start = NOW_MS - DAY_MS

    for uid in contact_ids:
        count = rng.randint(8, 15)
        timestamps = _timeline(rng, count, window_start, NOW_MS)
        key = f"{min(demo_id, uid)}:{max(demo_id, uid)}"
        conv = Conversation(
            type="direct",
            title=None,
            avatar_color=None,
            direct_key=key,
            created_by=demo_id,
            created_at=timestamps[0],
        )
        db.add(conv)
        db.flush()
        conv_id = conv.conversation_id
        for mid in (demo_id, uid):
            member = ConversationMember(
                conversation_id=conv_id,
                user_id=mid,
                role="member",
                joined_at=timestamps[0],
                is_archived=0,
                is_pinned=0,
                is_muted=0,
            )
            db.add(member)
            member_index[(conv_id, mid)] = member
        last_read_id = None
        for i, ts in enumerate(timestamps):
            sender = demo_id if i % 2 == 0 else uid
            status = RECEIPT_STATES[i % 3]
            message = Message(
                conversation_id=conv_id,
                sender_id=sender,
                client_id=f"seed-demo-d{uid}-{i}",
                body=for_message(rng, sender == demo_id, "direct"),
                kind="text",
                created_at=ts,
            )
            db.add(message)
            db.flush()
            other = uid if sender == demo_id else demo_id
            _add_receipts(db, message, [other], status)
            if (
                sender != demo_id
                and status == "completed"
                and (last_read_id is None or message.message_id > last_read_id)
            ):
                last_read_id = message.message_id
        if last_read_id is not None:
            member_index[(conv_id, demo_id)].last_read_message_id = last_read_id

    demo_group_ids = [
        gid for gid in sorted(members_by_group) if members_by_group[gid]
    ][:DEMO_GROUP_COUNT]
    for gid in demo_group_ids:
        conv_id = group_convs[gid]
        sample_member_ids = [uid for (cid, uid) in member_index if cid == conv_id]
        demo_member = ConversationMember(
            conversation_id=conv_id,
            user_id=demo_id,
            role="member",
            joined_at=window_start,
            is_archived=0,
            is_pinned=0,
            is_muted=0,
        )
        db.add(demo_member)
        member_index[(conv_id, demo_id)] = demo_member
        count = rng.randint(5, 10)
        timestamps = _timeline(rng, count, window_start, NOW_MS)
        last_read_id = None
        for i, ts in enumerate(timestamps):
            if i % 2 == 0:
                sender = demo_id
            else:
                sender = sample_member_ids[(i // 2) % len(sample_member_ids)]
            status = RECEIPT_STATES[i % 3]
            message = Message(
                conversation_id=conv_id,
                sender_id=sender,
                client_id=f"seed-demo-g{gid}-{i}",
                body=for_message(rng, sender == demo_id, "group"),
                kind="text",
                created_at=ts,
            )
            db.add(message)
            db.flush()
            recipients = [uid for (cid, uid) in member_index if cid == conv_id]
            _add_receipts(db, message, recipients, status)
            if (
                sender != demo_id
                and status == "completed"
                and (last_read_id is None or message.message_id > last_read_id)
            ):
                last_read_id = message.message_id
        if last_read_id is not None:
            demo_member.last_read_message_id = last_read_id


def build_db(out_path: str) -> None:
    rng = random.Random(RNG_SEED)
    sample = sqlite3.connect(":memory:")
    sample.row_factory = sqlite3.Row
    sample.executescript(SAMPLE_SQL.read_text(encoding="utf-8"))

    _reset_file(out_path)
    engine = create_engine(f"sqlite:///{out_path}")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        state = _seed_sample(db, sample, rng)
        _seed_demo(db, sample, rng, state)
        db.commit()
    finally:
        db.close()
        engine.dispose()
        sample.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the Signal clone database from the sample dump"
    )
    parser.add_argument(
        "--out", default="app.db", help="output sqlite path (default: app.db)"
    )
    args = parser.parse_args()
    build_db(args.out)
    con = sqlite3.connect(args.out)
    try:
        counts = {
            table: con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in (
                "users",
                "contacts",
                "conversations",
                "conversation_members",
                "messages",
                "message_receipts",
            )
        }
    finally:
        con.close()
    print(f"built {args.out}: " + ", ".join(f"{k}={v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
