"""WebSocket connection wrapper.

Spec:
- Orquestor.md §FASE 5
- R7 WebSocket único por usuario, heartbeat 30s, timeout 120s
- R13 Logging de eventos auth/conexión

Cada `WSConnection` envuelve un `WebSocket` de FastAPI + el `User`
autenticado + el set de subscripciones (threads / tickets).
El `SecureWSManager` coordina las conexiones a nivel global.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.models.user import User

logger = logging.getLogger("tundra.ws")

# R7: tiempos del spec.
HEARTBEAT_INTERVAL_S = 30
CONNECTION_TIMEOUT_S = 120


@dataclass
class WSConnection:
    """Conexión WS de un usuario autenticado."""

    websocket: WebSocket
    user: User
    connected_at: float = field(default_factory=time.monotonic)
    last_seen_at: float = field(default_factory=time.monotonic)
    subscribed_threads: set[UUID] = field(default_factory=set)
    subscribed_tickets: set[UUID] = field(default_factory=set)
    _send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @property
    def user_id(self) -> UUID:
        return self.user.id

    @property
    def is_open(self) -> bool:
        return self.websocket.application_state == WebSocketState.CONNECTED

    @property
    def is_stale(self) -> bool:
        """True si superó el timeout sin actividad — debe cerrarse."""
        return (time.monotonic() - self.last_seen_at) > CONNECTION_TIMEOUT_S

    def touch(self) -> None:
        self.last_seen_at = time.monotonic()

    async def send_json(self, payload: dict[str, Any]) -> bool:
        """Envía JSON. Retorna False si la conexión ya está rota.

        Usa lock para evitar interleaving cuando varios coros mandan al
        mismo socket en paralelo (broadcast + ping concurrentes).
        """
        if not self.is_open:
            return False
        async with self._send_lock:
            if not self.is_open:
                return False
            try:
                await self.websocket.send_text(json.dumps(payload))
                return True
            except Exception as exc:  # broad on purpose — socket failures
                logger.info(
                    "ws.send.fail user_id=%s err=%s",
                    self.user_id,
                    type(exc).__name__,
                )
                return False

    async def close(self, code: int = 1000, reason: str = "") -> None:
        """Cierra el socket si sigue abierto. Idempotente."""
        if not self.is_open:
            return
        try:
            await self.websocket.close(code=code, reason=reason)
        except Exception as exc:  # noqa: BLE001
            logger.debug(
                "ws.close.error user_id=%s err=%s",
                self.user_id,
                type(exc).__name__,
            )

    def subscribe_thread(self, thread_id: UUID) -> None:
        self.subscribed_threads.add(thread_id)

    def unsubscribe_thread(self, thread_id: UUID) -> None:
        self.subscribed_threads.discard(thread_id)

    def subscribe_ticket(self, ticket_id: UUID) -> None:
        self.subscribed_tickets.add(ticket_id)

    def unsubscribe_ticket(self, ticket_id: UUID) -> None:
        self.subscribed_tickets.discard(ticket_id)
