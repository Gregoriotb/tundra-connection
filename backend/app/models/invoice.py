"""Invoice model — facturas (PRODUCT_SALE / INTERNET_SERVICE / SERVICE_QUOTATION).

Spec:
- DATABASE_SCHEMA.md §INVOICES — mirror exacto del DDL
- Orquestor.md §FASE 3
- R5 ORM puro
- R15 `metadata` reservado → renombrado a `extra_data` en el ORM
        (la columna SQL se sigue llamando `metadata` para mantener el DDL).
- R16 PK UUID

`items` JSONB — array snapshot de líneas (PRODUCT_SALE) o vacío
              (INTERNET_SERVICE — el plan vive en `plan_seleccionado`).

Estructuras esperadas:

  items (PRODUCT_SALE):
  [
    {
      "item_id": "<uuid>",
      "name": "Router XYZ",
      "unit_price": "150.00",
      "quantity": 2,
      "subtotal": "300.00"
    }
  ]

  plan_seleccionado (INTERNET_SERVICE):
  {
    "service_id": "<uuid>",
    "service_slug": "fibra_optica",
    "plan_id": "plan_50mb",
    "nombre": "50 Mbps",
    "precio_mensual": "25.00",
    "precio_instalacion": "50.00"
  }
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UUIDPKMixin
from app.models.user import User

# Mirror de los CHECK constraints del DDL.
INVOICE_TIPOS: tuple[str, ...] = (
    "PRODUCT_SALE",
    "INTERNET_SERVICE",
    "SERVICE_QUOTATION",
)
INVOICE_ESTADOS: tuple[str, ...] = (
    "pending",
    "paid",
    "cancelled",
    "overdue",
    "refunded",
)


class Invoice(Base, UUIDPKMixin):
    """Factura emitida por el sistema."""

    __tablename__ = "invoices"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    estado: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="pending"
    )

    # Montos en Decimal — nunca float (R9, anti-patrón #5).
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0"
    )
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    items: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    direccion_instalacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan_seleccionado: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )

    # R15: el atributo Python es `extra_data` — la columna SQL es `metadata`
    # para mantener el DDL del spec.
    extra_data: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default="{}",
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
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relaciones ──────────────────────────────────────────────────────────
    user: Mapped[User] = relationship("User", lazy="joined")

    # ── Constraints (mirror DDL) ────────────────────────────────────────────
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('PRODUCT_SALE', 'INTERNET_SERVICE', 'SERVICE_QUOTATION')",
            name="invoices_tipo_check",
        ),
        CheckConstraint(
            "estado IN ('pending', 'paid', 'cancelled', 'overdue', 'refunded')",
            name="invoices_estado_check",
        ),
        CheckConstraint("subtotal >= 0", name="invoices_subtotal_non_negative"),
        CheckConstraint("tax_amount >= 0", name="invoices_tax_non_negative"),
        CheckConstraint("total >= 0", name="invoices_total_non_negative"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Invoice id={self.id} user_id={self.user_id} "
            f"tipo={self.tipo} estado={self.estado} total={self.total}>"
        )
