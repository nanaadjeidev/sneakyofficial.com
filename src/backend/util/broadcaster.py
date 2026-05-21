import json
import logging
from aiohttp import web

logger = logging.getLogger("broadcaster")


class TournamentBroadcaster:
    _instance: "TournamentBroadcaster | None" = None

    def __init__(self) -> None:
        self._connections: set[web.WebSocketResponse] = set()

    @classmethod
    def get(cls) -> "TournamentBroadcaster":
        if cls._instance is None:
            cls._instance = TournamentBroadcaster()
        return cls._instance

    def add(self, ws: web.WebSocketResponse) -> None:
        self._connections.add(ws)

    def remove(self, ws: web.WebSocketResponse) -> None:
        self._connections.discard(ws)

    async def broadcast(self, data: dict) -> None:
        if not self._connections:
            return
        text = json.dumps(data)
        dead: set[web.WebSocketResponse] = set()
        for ws in list(self._connections):
            try:
                await ws.send_str(text)
            except Exception:
                dead.add(ws)
        self._connections -= dead
