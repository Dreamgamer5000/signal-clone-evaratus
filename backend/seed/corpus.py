"""Deterministic natural-chat corpus for seeded message bodies."""

import random

GREETINGS = [
    "hey",
    "hi!",
    "hello there",
    "morning!",
    "hey, what's up?",
    "yo!",
    "good evening",
    "hi hi",
    "heya",
    "hey you",
    "hi there!",
]

QUESTIONS = [
    "how's it going?",
    "did you see the game last night?",
    "are we still on for tomorrow?",
    "what time works for you?",
    "want to grab coffee later?",
    "did you get my last message?",
    "what are you up to this weekend?",
    "have you tried that new cafe?",
    "want to hop on a call?",
    "should we bring anything?",
    "did that package arrive?",
    "how did the interview go?",
    "you free later?",
    "guess what happened today?",
    "lunch tomorrow?",
]

REPLIES = [
    "haha nice",
    "sounds good",
    "ok cool",
    "lol",
    "makes sense",
    "totally",
    "for sure",
    "got it",
    "nice one",
    "great idea",
    "i'm in",
    "same here",
    "no worries",
    "let's do it",
    "true",
    "yeah exactly",
    "on my way!",
    "just saw this",
    "give me five",
    "let me check",
    "perfect",
    "oh wow",
    "that's wild",
    "couldn't agree more",
    "haha",
    "right?",
    "let's talk later",
    "missed you today",
]

EMOJI = ["😊", "👍", "😂", "🎉", "🙌", "❤️", "😎", "✌️", "🤔", "🔥", "😅", "✨"]

_POOLS = (GREETINGS, QUESTIONS, REPLIES)


def for_message(rng: random.Random, sender_is_me: bool, conversation_kind: str) -> str:
    """Return one natural chat line.

    Deterministic given the caller-supplied ``rng``: re-runs with a freshly
    seeded ``random.Random(12345)`` replayed over the same call sequence
    produce identical output.
    """
    if conversation_kind == "group":
        weights = [3, 2, 5]
    else:
        weights = [3, 3, 4]
    if sender_is_me:
        weights[2] += 1
    pool = rng.choices(_POOLS, weights=weights)[0]
    text = rng.choice(pool)
    if rng.random() < 0.3:
        text = f"{text} {rng.choice(EMOJI)}"
    return text
