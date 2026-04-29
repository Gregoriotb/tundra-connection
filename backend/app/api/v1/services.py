"""Services endpoints — GET público de los 3 servicios fijos.

Spec:
- Orquestor.md §FASE 3 + mapa de endpoints §Servicios
- R5 ORM puro
- R14 Solo los endpoints listados; admin de servicios llega en FASE 8
- R17 Prefijos sin "/" final
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user
from app.models.service import Service
from app.models.user import User
from app.schemas.service import ServiceListOut, ServiceOut

public_router = APIRouter()


@public_router.get(
    "",
    response_model=ServiceListOut,
    summary="Lista de los 3 servicios activos (fibra, satelital, extras).",
)
def list_services(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ServiceListOut:
    stmt = select(Service).order_by(Service.display_order, Service.created_at)
    # Inactivos solo son visibles para admin (consistencia con catalog).
    if not (current_user and current_user.is_admin):
        stmt = stmt.where(Service.is_active.is_(True))

    services = list(db.scalars(stmt).all())
    return ServiceListOut(
        items=[ServiceOut.model_validate(s) for s in services],
        total=len(services),
    )


@public_router.get(
    "/{slug}",
    response_model=ServiceOut,
    summary="Detalle de un servicio por slug (fibra_optica, satelital, servicios_extras).",
)
def get_service(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ServiceOut:
    service = db.scalar(select(Service).where(Service.slug == slug))
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    if not service.is_active and not (current_user and current_user.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    return ServiceOut.model_validate(service)
