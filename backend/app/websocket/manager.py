"""SecureWSManager — coordinador global de conexiones WebSocket.

Spec:
- Orquestor.md §FASE 5
- R7  WebSocket único por usuario, heartbeat 30s, timeout 120s
- R3  Auth via JWT (delegado al endpoint /ws antes de llamar `connect`)
- R13 Logging de eventos de conexión

Diseño:
- Singleton a nivel de módulo: `manager = SecureWSManager()`.
- Una conexión por user_id. Si llega una segunda, la PRIMERA se cierra
  (UX: "tu cuenta se conectó en otra ventana").
- `send_to_user`, `broadcast_to_thread_subscribers`,
  `broadcast_to_ticket_subscribers` son los puntos de emisión.
- `sweep_stale` corre como tarea en background y barre conexiones
  inactivas >120s.

Importante:
- Los handlers que emiten eventos (chat_quotations, support_tickets,
  invoices, admin) llaman al manager VÍA un wrapper sync→async usando
  `asyncio.run_coroutine_threadsafe` o un helper `emit_event(...)`
  declarado más abajo. Esto evita que un endpoint sync se preocupe por
  awaitables.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from uuid import UUID

from fastapi import WebSocket

from app.models.user import User
from app.websocket.connection import (
    CONNECTION_TIMEOUT_S,
    HEARTBEAT_INTERVAL_S,
    WSConnection,
)

logger = logging.getLogger("tundra.ws.manager")


class SecureWSManager:
    """Gestor central de conexiones WebSocket."""

    def __init__(self) -> None:
        self._connections: dict[UUID, WSConnection] = {}
        self._lock = asyncio.Lock()
        self._sweeper_task: asyncio.Task[None] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Guarda el event loop principal para emit_event sync→async."""
        self._loop = loop

    def start_sweeper(self) -> None:
        """Lanza la tarea background que cierra conexiones stale."""
        if self._sweeper_task is None or self._sweeper_task.done():
            self._sweeper_task = asyncio.create_task(self._sweep_loop())

    async def shutdown(self) -> None:
        """Cierra todas las conexiones limpiamente y cancela el sweeper."""
        if self._sweeper_task is not None:
            self._sweeper_task.cancel()
            try:
                await self._sweeper_task
            except asyncio.CancelledError:
                pass
            self._sweeper_task = None

        async with self._lock:
            connections = list(self._connections.values())
            self._connections.clear()
        for conn in connections:
            await conn.close(code=1001, reason="Server shutdown")

    # ── Connect / Disconnect ───────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, user: User) -> WSConnection:
        """Registra una conexión nueva. Si el user ya tenía una, la cierra."""
        await websocket.accept()

        previous: WSConnection | None = None
        new_conn = WSConnection(websocket=websocket, user=user)

        async with self._lock:
            previous = self._connections.get(user.id)
            self._connections[user.id] = new_conn

        if previous is not None:
            logger.info(
                "ws.connect.replace user_id=%s old_age=%.1fs",
                user.id,
                time.monotonic() - previous.connected_at,
            )
            await previous.send_json(
                {"type": "session_replaced", "payload": {"reason": "new_connection"}}
            )
            await previous.close(code=4000, reason="Session replaced")

        logger.info("ws.connect user_id=%s admin=%s", user.id, user.is_admin)
        return new_conn

    async def disconnect(self, connection: WSConnection) -> None:
        """Limpieza al cerrar. Idempotente."""
        async with self._lock:
            current = self._connections.get(connection.user_id)
            if current is connection:
                self._connections.pop(connection.user_id, None)
        await connection.close(code=1000, reason="Bye")
        logger.info(
            "ws.disconnect user_id=%s duration=%.1fs",
            connection.user_id,
            time.monotonic() - connection.connected_at,
        )

    # ── Lookup ─────────────────────────────────────────────────────────────

    def is_user_online(self, user_id: UUID) -> bool:
        conn = self._connections.get(user_id)
        return conn is not None and conn.is_open

    def get_connection(self, user_id: UUID) -> WSConnection | None:
        return self._connections.get(user_id)

    # ── Emisión ────────────────────────────────────────────────────────────

    async def send_to_user(
        self, user_id: UUID, *, type: str, payload: dict[str, Any]
    ) -> bool:
        """Envía un evento a un usuario específico. False si offline o falla."""
        conn = self._connections.get(user_id)
        if conn is None:
            return False
        ok = await conn.send_json({"type": type, "payload": payload})
        if not ok:
            await self.disconnect(conn)
        return ok

    async def broadcast_to_thread_subscribers(
        self,
        thread_id: UUID,
        *,
        type: str,
        payload: dict[str, Any],
        exclude_user_id: UUID | None = None,
    ) -> int:
        """Manda a todas las conexiones suscritas al thread. Retorna count."""
        return await self._broadcast_filtered(
            type=type,
            payload=payload,
            predicate=lambda c: thread_id in c.subscribed_threads
            and c.user_id != exclude_user_id,
        )

    async def broadcast_to_ticket_subscribers(
        self,
        ticket_id: UUID,
        *,
        type: str,
        payload: dict[str, Any],
        exclude_user_id: UUID | None = None,
    ) -> int:
        return await self._broadcast_filtered(
            type=type,
            payload=payload,
            predicate=lambda c: ticket_id in c.subscribed_tickets
            and c.user_id != exclude_user_id,
        )

    async def broadcast_to_admins(
        self, *, type: str, payload: dict[str, Any]
    ) -> int:
        """Eventos que solo importan a admins (ej: nuevo ticket creado)."""
        return await self._broadcast_filtered(
            type=type,
            payload=payload,
            predicate=lambda c: c.user.is_admin,
        )

    async def _broadcast_filtered(
        self,
        *,
        type: str,
        payload: dict[str, Any],
        predicate,
    ) -> int:
        # Snapshot bajo lock para evitar mutación concurrente.
        async with self._lock:
            targets = [c for c in self._connections.values() if predicate(c)]

        sent = 0
        dead: list[WSConnection] = []
        for conn in targets:
            ok = await conn.send_json({"type": type, "payload": payload})
            if ok:
                sent += 1
            else:
                dead.append(conn)
        for conn in dead:
            await self.disconnect(conn)
        return sent

    # ── Sync→Async helper ──────────────────────────────────────────────────

    def emit_event_sync(
        self,
        coro_factory,
    ) -> None:
        """Permite a endpoints SYNC disparar eventos WS sin manejar awaitables.

        Uso desde un handler sync:
            manager.emit_event_sync(
                lambda: manager.send_to_user(user_id, type="...", payload={...})
            )

        El coro se programa en el event loop principal (capturado en
        `attach_loop`). Si por algún motivo el loop no está disponible,
        loggea y descarta — el evento WS no es transaccional.
        """
        if self._loop is None or not self._loop.is_running():
            logger.warning("ws.emit.no_loop type=event_drop")
            return
        try:
            asyncio.run_coroutine_threadsafe(coro_factory(), self._loop)
        except Exception as exc:  # noqa: BLE001
            logger.warning("ws.emit.fail err=%s", type(exc).__name__)

    # ── Sweeper de stale connections ───────────────────────────────────────

    async def _sweep_loop(self) -> None:
        """Tarea background: barre conexiones inactivas + envía heartbeats."""
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL_S)
                await self._sweep_once()
        except asyncio.CancelledError:
            raise

    async def _sweep_once(self) -> None:
        async with self._lock:
            snapshot = list(self._connections.values())

        stale: list[WSConnection] = []
        for conn in snapshot:
            if conn.is_stale:
                stale.append(conn)
                continue
            # Heartbeat: el cliente responde con `ping` y nosotros con `pong`,
            # pero también nosotros le mandamos un latido para que detecte
            # un servidor caído rápido.
            if not conn.is_open:
                stale.append(conn)
                continue
            ok = await conn.send_json({"type": "heartbeat", "payload": {}})
            if not ok:
                stale.append(conn)

        for conn in stale:
            logger.info(
                "ws.sweep.close user_id=%s reason=%s",
                conn.user_id,
                "stale" if conn.is_stale else "send_failed",
            )
            await self.disconnect(conn)

    # ── Stats (opcional, útil para health checks) ──────────────────────────

    def stats(self) -> dict[str, int]:
        return {
            "active_connections": len(self._connections),
            "timeout_s": CONNECTION_TIMEOUT_S,
            "heartbeat_s": HEARTBEAT_INTERVAL_S,
        }


# ── Singleton compartido por toda la app ────────────────────────────────────

manager = SecureWSManager()
