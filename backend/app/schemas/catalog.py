"""Catalog schemas — Pydantic v2.

Spec:
- Orquestor.md §FASE 2
- DATABASE_SCHEMA.md §CATALOG ITEMS
- R2 extra="forbid" en inputs
- R9 Validación server-side: precio >= 0, stock >= 0, tipo en CHECK constraint

Inputs (admin):  CatalogItemCreateIn, CatalogItemUpdateIn
Outputs:         CatalogItemOut, CatalogItemListOut
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
)

# Mirror del CHECK constraint del DDL.
CatalogTipo = Literal["router", "camara", "equipo_red", "accesorio"]

PriceField = Annotated[
    Decimal,
    Field(
        max_digits=10,
        decimal_places=2,
        ge=Decimal("0.00"),
        le=Decimal("99999999.99"),
    ),
]


# ── Bases ────────────────────────────────────────────────────────────────────


class _InputBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _OutputBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Inputs (admin only) ─────────────────────────────────────────────────────


class CatalogItemCreateIn(_InputBase):
    """POST /admin/catalog — crea item nuevo.

    Tope lógico de 10 items se valida en el endpoint, no en el schema.
    """

    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    tipo: CatalogTipo
    price: PriceField
    stock: int = Field(default=0, ge=0, le=100_000)
    image_url: Optional[HttpUrl] = None
    is_active: bool = True


class CatalogItemUpdateIn(_InputBase):
    """PUT /admin/catalog/{id} — todos los campos opcionales.

    Al menos uno debe venir o el endpoint responde 400.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    tipo: Optional[CatalogTipo] = None
    price: Optional[PriceField] = None
    stock: Optional[int] = Field(default=None, ge=0, le=100_000)
    image_url: Optional[HttpUrl] = None
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "CatalogItemUpdateIn":
        if not any(
            v is not None for v in self.model_dump(exclude_none=False).values()
        ):
            raise ValueError("At least one field must be provided")
        return self


# ── Outputs ──────────────────────────────────────────────────────────────────


class CatalogItemOut(_OutputBase):
    """Vista pública/admin del item."""

    id: UUID
    name: str
    description: Optional[str]
    tipo: CatalogTipo
    price: Decimal
    stock: int
    image_url: Optional[str]
    is_active: bool
    is_in_stock: bool
    created_at: datetime

    @field_validator("price")
    @classmethod
    def _quantize_price(cls, v: Decimal) -> Decimal:
        # Garantiza dos decimales en la respuesta JSON, sin importar
        # cómo lo devuelva la BD.
        return v.quantize(Decimal("0.01"))


class CatalogItemListOut(BaseModel):
    """Wrapper de listado (permite agregar paginación más adelante)."""

    items: list[CatalogItemOut]
    total: int
