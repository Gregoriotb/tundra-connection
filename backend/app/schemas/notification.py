"""Notification schemas — Pydantic v2.

Spec:
- Orquestor.md §FASE 5
- DATABASE_SCHEMA.md §NOTIFICATIONS
- R2 extra="forbid" en inputs
- R9 Validación server-side
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

NotificationTipo = Literal[
    "chat_message",
    "quotation_status",
    "invoice_created",
    "ticket_updated",
    "ticket_assigned",
]


class NotificationOut(BaseModel):
    """Vista de una notificación. El payload se devuelve tal cual."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    tipo: NotificationTipo
    payload: dict[str, Any]
    read_at: datetime | None
    created_at: datetime
    is_read: bool


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    total: int


class UnreadCountOut(BaseModel):
    """Respuesta de GET /notifications/unread-count."""

    unread: int
