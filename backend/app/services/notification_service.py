"""Notification service — crea registros + dispara eventos WS.

Spec:
- Orquestor.md §FASE 5
- R5 ORM puro
- Una sola función pública: `notify(...)`. Cada feature la usa con su tipo
  apropiado (chat_message, quotation_status, invoice_created, etc.).

El evento WS es BEST-EFFORT: si el manager no puede emitir (user offline,
event loop no disponible), la notificación queda en BD. El frontend
hidratará al hacer login o al reconectar el WebSocket.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.schemas.notification import NotificationOut
from app.websocket.manager import manager

logger = logging.getLogger("tundra.notify")


def notify(
    db: Session,
    *,
    user_id: UUID,
    tipo: str,
    payload: dict[str, Any],
    commit: bool = True,
) -> Notification:
    """Crea Notification y emite WS event al destinatario.

    Args:
        db: Sesión activa (la mayoría de los call-sites ya tienen una abierta).
        user_id: Destinatario.
        tipo: Uno de NOTIFICATION_TIPOS.
        payload: Datos de contexto (depende del tipo).
        commit: Si True, hace commit aquí. False permite agrupar con otros
                cambios de la misma transacción (la mayoría de casos).

    Returns:
        La notificación recién creada (con id asignado tras flush).
    """
    notif = Notification(user_id=user_id, tipo=tipo, payload=payload)
    db.add(notif)
    if commit:
        db.commit()
        db.refresh(notif)
    else:
        db.flush()  # Para que tenga id antes de emitir.

    # Emite WS push (best-effort, no transaccional).
    serialized = NotificationOut.model_validate(notif).model_dump(mode="json")
    manager.emit_event_sync(
        lambda: manager.send_to_user(
            user_id, type="notification", payload=serialized
        )
    )

    logger.info(
        "notify.created user_id=%s tipo=%s notif_id=%s",
        user_id,
        tipo,
        notif.id,
    )
    return notif


def emit_thread_event(
    *,
    thread_id: UUID,
    type: str,
    payload: dict[str, Any],
    exclude_user_id: UUID | None = None,
) -> None:
    """Broadcast a suscriptores de un thread (chat_message, thread_updated)."""
    manager.emit_event_sync(
        lambda: manager.broadcast_to_thread_subscribers(
            thread_id,
            type=type,
            payload=payload,
            exclude_user_id=exclude_user_id,
        )
    )
