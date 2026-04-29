"""Notification model — cola de notificaciones por usuario.

Spec:
- DATABASE_SCHEMA.md §NOTIFICATIONS — mirror del DDL
- Orquestor.md §FASE 5
- R5 ORM puro
- R16 PK UUID

Tipos válidos (`tipo`):
  chat_message       → nuevo mensaje en un thread del usuario
  quotation_status   → cambió el estado de un thread
  invoice_created    → factura emitida
  ticket_updated     → ticket de soporte cambió de estado / nota interna
  ticket_assigned    → admin asignado al ticket

Estructura típica de `payload` JSONB (varía por tipo):
  {
    "thread_id": "<uuid>",
    "message_id": "<uuid>",
    "preview": "Hola, te llegó la cotización…",
    "from_user": {"first_name": "Soporte"}
  }
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPKMixin

# Tipos enumerados a nivel de Python (no es CHECK porque el DDL del spec
# no lo declara — admite extensibilidad sin migrar).
NOTIFICATION_TIPOS: tuple[str, ...] = (
    "chat_message",
    "quotation_status",
    "invoice_created",
    "invoice_status_change",
    "ticket_updated",
    "ticket_assigned",
)


class Notification(Base, UUIDPKMixin):
    """Notificación dirigida a un usuario."""

    __tablename__ = "notifications"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Notification id={self.id} user_id={self.user_id} "
            f"tipo={self.tipo} read={self.is_read}>"
        )
