"""Invoice schemas — Pydantic v2.

Spec:
- Orquestor.md §FASE 3 + §FASE 8 (admin update)
- DATABASE_SCHEMA.md §INVOICES
- R2 extra="forbid" en inputs
- R9 Validación server-side TOTAL — el endpoint /invoices/checkout
     re-calcula montos contra la BD; el cliente nunca dicta el precio
     final (anti-patrón #5 prohibido).

Schemas:
    CheckoutIn (discriminated union por `tipo`):
      - ProductSaleCheckoutIn
      - InternetServiceCheckoutIn
    InvoiceOut, InvoiceListOut, InvoiceUpdateStatusIn (admin, FASE 8)
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Mirror del CHECK del DDL.
InvoiceTipo = Literal["PRODUCT_SALE", "INTERNET_SERVICE", "SERVICE_QUOTATION"]
InvoiceEstado = Literal[
    "pending", "paid", "cancelled", "overdue", "refunded"
]


# ─── Inputs: Checkout ─────────────────────────────────────────────────────


class _CheckoutBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProductSaleLineIn(_CheckoutBase):
    """Línea individual del cart frontend.

    `unit_price` es informativo: el backend NO confía en este valor,
    re-consulta el precio actual en BD al construir la factura.
    """

    item_id: UUID
    quantity: int = Field(..., ge=1, le=100)
    unit_price: Optional[Decimal] = Field(
        default=None,
        max_digits=10,
        decimal_places=2,
        ge=Decimal("0.00"),
    )


class ProductSaleCheckoutIn(_CheckoutBase):
    """POST /invoices/checkout con tipo=PRODUCT_SALE."""

    tipo: Literal["PRODUCT_SALE"]
    items: list[ProductSaleLineIn] = Field(..., min_length=1, max_length=20)

    @model_validator(mode="after")
    def _no_duplicate_items(self) -> "ProductSaleCheckoutIn":
        seen = set()
        for line in self.items:
            if line.item_id in seen:
                raise ValueError(f"Duplicate item_id in items: {line.item_id}")
            seen.add(line.item_id)
        return self


class InternetServiceCheckoutIn(_CheckoutBase):
    """POST /invoices/checkout con tipo=INTERNET_SERVICE."""

    tipo: Literal["INTERNET_SERVICE"]
    service_id: UUID
    plan_id: str = Field(..., min_length=1, max_length=64)
    direccion_instalacion: str = Field(..., min_length=10, max_length=500)


CheckoutIn = Annotated[
    Union[ProductSaleCheckoutIn, InternetServiceCheckoutIn],
    Field(discriminator="tipo"),
]


# ─── Inputs: Admin ────────────────────────────────────────────────────────


class InvoiceUpdateStatusIn(BaseModel):
    """PATCH /admin/invoices/{id}/status — cambio de estado por admin."""

    model_config = ConfigDict(extra="forbid")

    estado: InvoiceEstado
    nota: Optional[str] = Field(default=None, max_length=1000)


# ─── Outputs ──────────────────────────────────────────────────────────────


class InvoiceLineOut(BaseModel):
    """Snapshot de una línea de factura (PRODUCT_SALE)."""

    model_config = ConfigDict(extra="ignore")

    item_id: UUID
    name: str
    unit_price: Decimal
    quantity: int
    subtotal: Decimal


class InvoiceOut(BaseModel):
    """Vista privada del dueño y/o admin de una factura."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    tipo: InvoiceTipo
    estado: InvoiceEstado
    subtotal: Decimal
    tax_amount: Decimal
    total: Decimal
    items: list[dict[str, Any]]
    direccion_instalacion: Optional[str]
    plan_seleccionado: Optional[dict[str, Any]]
    extra_data: dict[str, Any] = Field(
        default_factory=dict,
        description="Mirror del campo SQL `metadata` (renombrado en el ORM por R15).",
    )
    created_at: datetime
    updated_at: datetime
    paid_at: Optional[datetime]


class InvoiceListOut(BaseModel):
    items: list[InvoiceOut]
    total: int
