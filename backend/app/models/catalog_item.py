"""CatalogItem model — productos físicos (routers, cámaras, equipos de red).

Spec:
- DATABASE_SCHEMA.md §CATALOG ITEMS — máximo 10 registros lógicos.
- Orquestor.md §FASE 2.
- R14 No alucinar: solo los campos declarados en el DDL.
- R16 PK UUID consistente.

Notas:
- `is_active` permite soft delete sin perder histórico de invoices que
  refieran al item (el line item guarda snapshot en JSONB, pero el FK
  conceptual sigue válido).
- Precio con `DECIMAL(10,2)` → en Python se mapea a `Decimal`, NUNCA `float`.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPKMixin

CATALOG_TIPOS: tuple[str, ...] = ("router", "camara", "equipo_red", "accesorio")


class CatalogItem(Base, UUIDPKMixin):
    """Producto físico del catálogo (máx 10 lógicos)."""

    __tablename__ = "catalog_items"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    stock: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('router', 'camara', 'equipo_red', 'accesorio')",
            name="catalog_items_tipo_check",
        ),
        CheckConstraint("price >= 0", name="catalog_items_price_non_negative"),
        CheckConstraint("stock >= 0", name="catalog_items_stock_non_negative"),
    )

    @property
    def is_in_stock(self) -> bool:
        return self.is_active and self.stock > 0

    def __repr__(self) -> str:  # pragma: no cover
        return f"<CatalogItem id={self.id} name={self.name!r} stock={self.stock}>"
