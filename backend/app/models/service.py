"""Service model — los 3 servicios fijos (fibra, satelital, extras).

Spec:
- DATABASE_SCHEMA.md §SERVICES + §INTERNET PLANS (estructura JSONB)
- Orquestor.md §FASE 3
- R14 Solo 3 servicios — los seeds están en migración 0004
- R15 NO usar `metadata` reservado
- R16 PK UUID

Estructura esperada de `planes` JSONB (espejo del comentario del DDL):
[
  {
    "id": "plan_50mb",
    "nombre": "50 Mbps",
    "velocidad": "50mb",
    "precio_mensual": 25.00,
    "tipo_plan": "residencial",
    "caracteristicas": ["Simétrico", "IP Estática opcional"]
  }
]
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPKMixin

# Slugs fijos que el sistema reconoce. R14: no inventar nuevos sin spec.
SERVICE_SLUGS: tuple[str, ...] = ("fibra_optica", "satelital", "servicios_extras")


class Service(Base, UUIDPKMixin):
    """Servicio comercial. Solo 3 registros lógicos."""

    __tablename__ = "services"

    slug: Mapped[str] = mapped_column(
        String(50), nullable=False, unique=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    precio_instalacion_base: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0"
    )
    # JSONB array de planes (ver docstring superior).
    planes: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "slug IN ('fibra_optica', 'satelital', 'servicios_extras')",
            name="services_slug_check",
        ),
        CheckConstraint(
            "precio_instalacion_base >= 0",
            name="services_precio_instalacion_non_negative",
        ),
    )

    def find_plan(self, plan_id: str) -> dict[str, Any] | None:
        """Devuelve el plan con `id == plan_id` dentro del JSONB, o None."""
        for plan in self.planes:
            if isinstance(plan, dict) and plan.get("id") == plan_id:
                return plan
        return None

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Service slug={self.slug} planes={len(self.planes)}>"
