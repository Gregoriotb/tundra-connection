"""QuotationThread model — hilo de cotización para servicios extras.

Spec:
- DATABASE_SCHEMA.md §QUOTATION THREADS — mirror exacto del DDL
- Orquestor.md §FASE 4
- Orquestor §Diferencias clave: chat-cotización SOLO para Servicios Extras
- R5 ORM puro
- R16 PK UUID
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UUIDPKMixin
from app.models.service import Service
from app.models.user import User

# Estados del hilo, mirror del CHECK del DDL.
QUOTATION_ESTADOS: tuple[str, ...] = (
    "pending",
    "active",
    "quoted",
    "negotiating",
    "closed",
    "cancelled",
)


class QuotationThread(Base, UUIDPKMixin):
    """Hilo de cotización entre cliente y admin (solo servicios extras)."""

    __tablename__ = "quotation_threads"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    service_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    estado: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="pending"
    )
    presupuesto_estimado: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    requerimiento_inicial: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    direccion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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
    user: Mapped[User] = relationship("User", lazy="joined")
    service: Mapped[Optional[Service]] = relationship("Service", lazy="joined")
    # `messages` se materializa al hacer JOIN explícito en el endpoint
    # (no lazy="joined" para evitar cargar TODO el historial cada vez).

    __table_args__ = (
        CheckConstraint(
            "estado IN ('pending', 'active', 'quoted', 'negotiating', 'closed', 'cancelled')",
            name="quotation_threads_estado_check",
        ),
        CheckConstraint(
            "presupuesto_estimado IS NULL OR presupuesto_estimado >= 0",
            name="quotation_threads_presupuesto_non_negative",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<QuotationThread id={self.id} user_id={self.user_id} "
            f"estado={self.estado}>"
        )
