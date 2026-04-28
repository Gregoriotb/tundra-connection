"""SupportTicket model — reportes de fallas tipo Alloy.

Spec:
- DATABASE_SCHEMA.md §SUPPORT TICKETS — mirror del DDL
- Orquestor.md §FASE 6
- R5 ORM puro
- R16 PK UUID

Estructuras JSONB:

  adjuntos:
  [
    {"url": "...", "filename": "...", "mime_type": "...", "size_bytes": N}
  ]

  historial_estados:
  [
    {
      "from_estado": "abierto",
      "to_estado": "en_revision",
      "by_user_id": "<uuid>",
      "nota": "...",
      "at": "2026-04-27T15:30:00Z"
    }
  ]
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UUIDPKMixin
from app.models.user import User

TICKET_TIPOS: tuple[str, ...] = ("incidencia", "requerimiento")
TICKET_SERVICIOS: tuple[str, ...] = (
    "fibra_optica",
    "satelital",
    "servicios_extras",
    "otro",
)
TICKET_ESTADOS: tuple[str, ...] = (
    "abierto",
    "en_revision",
    "remitido",
    "en_proceso",
    "solucionado",
    "cancelado",
)
TICKET_PRIORIDADES: tuple[str, ...] = ("baja", "media", "alta", "critica")

TERMINAL_ESTADOS: frozenset[str] = frozenset({"solucionado", "cancelado"})


class SupportTicket(Base, UUIDPKMixin):
    """Ticket de soporte (reporte de falla o requerimiento)."""

    __tablename__ = "support_tickets"

    ticket_number: Mapped[str] = mapped_column(
        String(20), nullable=False, unique=True, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    servicio_relacionado: Mapped[str] = mapped_column(String(50), nullable=False)
    estado: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="abierto"
    )
    prioridad: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="media"
    )
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)

    adjuntos: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    notas_internas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    historial_estados: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )

    assigned_to: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Relaciones ──────────────────────────────────────────────────────────
    user: Mapped[User] = relationship(
        "User", lazy="joined", foreign_keys=[user_id]
    )
    assignee: Mapped[Optional[User]] = relationship(
        "User", lazy="joined", foreign_keys=[assigned_to]
    )

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('incidencia', 'requerimiento')",
            name="support_tickets_tipo_check",
        ),
        CheckConstraint(
            "servicio_relacionado IN "
            "('fibra_optica', 'satelital', 'servicios_extras', 'otro')",
            name="support_tickets_servicio_check",
        ),
        CheckConstraint(
            "estado IN ('abierto', 'en_revision', 'remitido', "
            "'en_proceso', 'solucionado', 'cancelado')",
            name="support_tickets_estado_check",
        ),
        CheckConstraint(
            "prioridad IN ('baja', 'media', 'alta', 'critica')",
            name="support_tickets_prioridad_check",
        ),
    )

    @property
    def is_terminal(self) -> bool:
        return self.estado in TERMINAL_ESTADOS

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<SupportTicket {self.ticket_number} estado={self.estado} "
            f"prioridad={self.prioridad}>"
        )
