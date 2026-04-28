"""Service schemas — Pydantic v2.

Spec:
- Orquestor.md §FASE 3
- DATABASE_SCHEMA.md §SERVICES + §INTERNET PLANS
- R2 extra="forbid" en inputs; planes con shape estricto
- R9 Validación server-side de tipo_plan, velocidad, etc.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ServiceSlug = Literal["fibra_optica", "satelital", "servicios_extras"]
TipoPlan = Literal["residencial", "empresarial", "personalizado"]

PrecioField = Annotated[
    Decimal,
    Field(max_digits=10, decimal_places=2, ge=Decimal("0.00")),
]


class _OutputBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─── Plan dentro del JSONB ────────────────────────────────────────────────


class InternetPlan(BaseModel):
    """Schema estricto de un plan dentro de services.planes."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=64)
    nombre: str = Field(..., min_length=1, max_length=120)
    velocidad: Optional[str] = Field(default=None, max_length=20)
    precio_mensual: PrecioField
    tipo_plan: TipoPlan = "residencial"
    caracteristicas: list[str] = Field(default_factory=list, max_length=20)


# ─── Outputs ──────────────────────────────────────────────────────────────


class ServiceOut(_OutputBase):
    """Vista pública de un servicio (con sus planes)."""

    id: UUID
    slug: ServiceSlug
    name: str
    subtitle: Optional[str]
    description: Optional[str]
    icon_name: Optional[str]
    precio_instalacion_base: Decimal
    planes: list[InternetPlan]
    is_active: bool
    display_order: int
    created_at: datetime


class ServiceListOut(BaseModel):
    """Wrapper para GET /services."""

    items: list[ServiceOut]
    total: int
