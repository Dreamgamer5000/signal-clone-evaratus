import asyncio


class EventBroker:
    def __init__(self) -> None:
        self._queues: dict[int, list[asyncio.Queue]] = {}
        self._presence: set[int] = set()

    def subscribe(self, user_id: int) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._queues.setdefault(user_id, []).append(queue)
        return queue

    def unsubscribe(self, user_id: int, queue: asyncio.Queue) -> None:
        queues = self._queues.get(user_id)
        if not queues:
            return
        if queue in queues:
            queues.remove(queue)
        if not queues:
            self._queues.pop(user_id, None)

    def publish(self, user_ids: list[int], event_type: str, payload: dict) -> None:
        frame = (event_type, payload)
        for user_id in user_ids:
            for queue in self._queues.get(user_id, []):
                queue.put_nowait(frame)

    def set_presence(self, user_id: int, online: bool) -> None:
        if online:
            self._presence.add(user_id)
        else:
            self._presence.discard(user_id)
        self.publish(
            list(self._queues.keys()),
            "presence.update",
            {"user_id": user_id, "online": online},
        )

    def is_online(self, user_id: int) -> bool:
        return user_id in self._presence


broker = EventBroker()
