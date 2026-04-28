"""WebSocket endpoint + handlers de mensajes cliente→servidor.

Spec:
- Orquestor.md §FASE 5
- Protocolo:
    Cliente→Servidor: {action: 'ping' | 'subscribe_thread' |
                              'unsubscribe_thread' | 'subscribe_ticket' |
                              'unsubscribe_ticket', ...}
    Servidor→Cliente: {type: 'pong' | 'heartbeat' | 'notification' |
                              'chat_message' | 'thread_updated' |
                              'ticket_updated' | ...}
- R3 Auth via JWT (?token=<JWT>)
- R7 Una conexión por usuario, heartbeat, timeout
- R13 Logging

Dispatch:
- Cada action tiene un handler dedicado.
- Acciones desconocidas → 400 + close.
- IDOR: subscribe_thread valida que el thread sea del usuario o el user
  sea admin antes de aceptar la suscripción.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from starlette.websockets import WebSocketState

from app.core.database import SessionLocal
from app.core.security import TokenError, decode_token
from app.models.quotation_thread import QuotationThread
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.websocket.connection import WSConnection
from app.websocket.manager import manager

logger = logging.getLogger("tundra.ws.handlers")

router = APIRouter()

# Acciones aceptadas. Cualquier otra → cerrar con 1003 (unsupported data).
KNOWN_ACTIONS: set[str] = {
    "ping",
    "subscribe_thread",
    "unsubscribe_thread",
    "subscribe_ticket",
    "unsubscribe_ticket",
}


# ─── Auth ────────────────────────────────────────────────────────────────────


def _resolve_user_from_token(token: str) -> User | None:
    """Decodifica JWT y carga el User. None si inválido / inactivo."""
    try:
        payload = decode_token(token, expected_type="access")
    except TokenError:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        user_id = UUID(str(sub))
    except (ValueError, TypeError):
        return None

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.id == user_id))
        if user is None or not user.is_active:
            return None
        # Detach del session — no necesitamos la sesión viva durante el WS;
        # las queries adicionales abrirán su propia sesión.
        db.expunge(user)
        return user


# ─── Endpoint principal ──────────────────────────────────────────────────────


@router.websocket("/ws")
async def ws_endpoint(
    websocket: WebSocket,
    token: str = Query(default="", description="JWT access token"),
) -> None:
    """Endpoint WebSocket único. Auth por query param (R3)."""
    user = _resolve_user_from_token(token) if token else None
    if user is None:
        # No usamos `accept` para evitar handshake completo si el token falla.
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        logger.info("ws.auth.fail")
        return

    connection = await manager.connect(websocket, user)

    try:
        while True:
            raw = await websocket.receive_text()
            connection.touch()
            await _dispatch(connection, raw)
    except WebSocketDisconnect:
        logger.info("ws.client_disconnect user_id=%s", user.id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "ws.unexpected user_id=%s err=%s",
            user.id,
            type(exc).__name__,
        )
    finally:
        await manager.disconnect(connection)


# ─── Dispatcher ──────────────────────────────────────────────────────────────


async def _dispatch(conn: WSConnection, raw: str) -> None:
    """Parsea un mensaje del cliente y rutea al handler correspondiente."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        await conn.send_json({"type": "error", "payload": {"detail": "invalid_json"}})
        return

    if not isinstance(data, dict):
        await conn.send_json({"type": "error", "payload": {"detail": "invalid_shape"}})
        return

    action = data.get("action")
    if not isinstance(action, str) or action not in KNOWN_ACTIONS:
        await conn.send_json(
            {"type": "error", "payload": {"detail": "unknown_action"}}
        )
        return

    handler = _HANDLERS[action]
    await handler(conn, data)


# ─── Handlers por acción ─────────────────────────────────────────────────────


async def _handle_ping(conn: WSConnection, _data: dict[str, Any]) -> None:
    await conn.send_json({"type": "pong", "payload": {}})


async def _handle_subscribe_thread(conn: WSConnection, data: dict[str, Any]) -> None:
    raw = data.get("thread_id")
    thread_id = _parse_uuid(raw)
    if thread_id is None:
        await conn.send_json(
            {"type": "error", "payload": {"detail": "invalid_thread_id"}}
        )
        return

    # IDOR: solo el dueño o admin pueden suscribirse a un thread.
    with SessionLocal() as db:
        thread = db.scalar(
            select(QuotationThread).where(QuotationThread.id == thread_id)
        )
        if thread is None:
            await conn.send_json(
                {"type": "error", "payload": {"detail": "thread_not_found"}}
            )
            return
        if thread.user_id != conn.user_id and not conn.user.is_admin:
            logger.warning(
                "ws.subscribe.idor user_id=%s thread_id=%s",
                conn.user_id,
                thread_id,
            )
            await conn.send_json(
                {"type": "error", "payload": {"detail": "thread_not_found"}}
            )
            return

    conn.subscribe_thread(thread_id)
    await conn.send_json(
        {
            "type": "subscribed",
            "payload": {"resource": "thread", "id": str(thread_id)},
        }
    )


async def _handle_unsubscribe_thread(conn: WSConnection, data: dict[str, Any]) -> None:
    thread_id = _parse_uuid(data.get("thread_id"))
    if thread_id is None:
        return  # silencioso — unsubscribe es idempotente
    conn.unsubscribe_thread(thread_id)
    await conn.send_json(
        {
            "type": "unsubscribed",
            "payload": {"resource": "thread", "id": str(thread_id)},
        }
    )


async def _handle_subscribe_ticket(conn: WSConnection, data: dict[str, Any]) -> None:
    """IDOR check real contra support_tickets (R4).

    Permitidos:
      - Cualquier admin (todos los tickets).
      - El dueño del ticket.
      - El admin asignado al ticket.

    Cualquier otro caller: 'ticket_not_found' (no leak de existencia).
    """
    ticket_id = _parse_uuid(data.get("ticket_id"))
    if ticket_id is None:
        await conn.send_json(
            {"type": "error", "payload": {"detail": "invalid_ticket_id"}}
        )
        return

    # Admin pasa siempre — accede a cualquier ticket en el panel.
    if not conn.user.is_admin:
        with SessionLocal() as db:
            ticket = db.scalar(
                select(SupportTicket).where(SupportTicket.id == ticket_id)
            )
            if ticket is None or ticket.user_id != conn.user_id:
                logger.warning(
                    "ws.subscribe_ticket.idor user_id=%s ticket_id=%s",
                    conn.user_id,
                    ticket_id,
                )
                await conn.send_json(
                    {"type": "error", "payload": {"detail": "ticket_not_found"}}
                )
                return

    conn.subscribe_ticket(ticket_id)
    await conn.send_json(
        {
            "type": "subscribed",
            "payload": {"resource": "ticket", "id": str(ticket_id)},
        }
    )


async def _handle_unsubscribe_ticket(conn: WSConnection, data: dict[str, Any]) -> None:
    ticket_id = _parse_uuid(data.get("ticket_id"))
    if ticket_id is None:
        return
    conn.unsubscribe_ticket(ticket_id)
    await conn.send_json(
        {
            "type": "unsubscribed",
            "payload": {"resource": "ticket", "id": str(ticket_id)},
        }
    )


_HANDLERS = {
    "ping": _handle_ping,
    "subscribe_thread": _handle_subscribe_thread,
    "unsubscribe_thread": _handle_unsubscribe_thread,
    "subscribe_ticket": _handle_subscribe_ticket,
    "unsubscribe_ticket": _handle_unsubscribe_ticket,
}


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _parse_uuid(raw: Any) -> UUID | None:
    if not isinstance(raw, str):
        return None
    try:
        return UUID(raw)
    except (ValueError, TypeError):
        return None


# Re-export para que main.py haga `app.include_router(ws_handlers.router)`.
__all__ = ["router", "ws_endpoint"]


# ── Helpers para que el WebSocketState importe correctamente en checks ─────
# (Algunos linters complain si está importado pero no usado en tiempo de
# diseño; aquí lo usamos en el endpoint indirectamente vía connection.is_open.)
_ = WebSocketState
