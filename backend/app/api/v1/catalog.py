"""Catalog endpoints — GET público + admin CRUD.

Spec:
- Orquestor.md §FASE 2 + mapa de endpoints §Catálogo
- R5  ORM en todas las queries (cero raw SQL)
- R9  Validación server-side (Pydantic v2)
- R13 Logging de cambios admin (auditable)
- R14 Solo los endpoints listados en el spec

Routers exportados:
    public_router  → GET /catalog, GET /catalog/{id}
    admin_router   → POST/PUT/DELETE /admin/catalog/...

main.py los monta con sus prefijos (R17: sin "/" final).
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user, require_admin
from app.models.catalog_item import CatalogItem
from app.models.user import User
from app.schemas.catalog import (
    CatalogItemCreateIn,
    CatalogItemListOut,
    CatalogItemOut,
    CatalogItemUpdateIn,
)

logger = logging.getLogger("tundra.catalog")

# Tope lógico declarado en el spec ("máx 10 productos físicos").
MAX_CATALOG_ITEMS = 10

public_router = APIRouter()
admin_router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# PÚBLICO
# ─────────────────────────────────────────────────────────────────────────────


@public_router.get(
    "",
    response_model=CatalogItemListOut,
    summary="Lista pública de items del catálogo (solo activos por default).",
)
def list_catalog(
    include_inactive: bool = Query(
        default=False,
        description="Solo si el caller es admin. Para usuarios normales se ignora.",
    ),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> CatalogItemListOut:
    stmt = select(CatalogItem).order_by(CatalogItem.created_at.desc())

    # Solo admins pueden ver inactivos. Cualquier otro caller que mande
    # include_inactive=true es ignorado silenciosamente (no es error).
    if not (include_inactive and current_user and current_user.is_admin):
        stmt = stmt.where(CatalogItem.is_active.is_(True))

    items = list(db.scalars(stmt).all())
    return CatalogItemListOut(
        items=[CatalogItemOut.model_validate(item) for item in items],
        total=len(items),
    )


@public_router.get(
    "/{item_id}",
    response_model=CatalogItemOut,
    summary="Detalle público de un item del catálogo.",
)
def get_catalog_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> CatalogItemOut:
    item = db.scalar(select(CatalogItem).where(CatalogItem.id == item_id))
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")

    # Items inactivos solo son visibles para admin.
    if not item.is_active and not (current_user and current_user.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")

    return CatalogItemOut.model_validate(item)


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN
# ─────────────────────────────────────────────────────────────────────────────


@admin_router.post(
    "",
    response_model=CatalogItemOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crea un item del catálogo (admin). Tope de 10 items totales.",
)
def create_catalog_item(
    payload: CatalogItemCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CatalogItemOut:
    total = db.scalar(select(func.count()).select_from(CatalogItem)) or 0
    if total >= MAX_CATALOG_ITEMS:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Catalog limit reached ({MAX_CATALOG_ITEMS} items max)",
        )

    item = CatalogItem(
        name=payload.name,
        description=payload.description,
        tipo=payload.tipo,
        price=payload.price,
        stock=payload.stock,
        image_url=str(payload.image_url) if payload.image_url else None,
        is_active=payload.is_active,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    logger.info(
        "catalog.create admin_id=%s item_id=%s tipo=%s price=%s",
        admin.id,
        item.id,
        item.tipo,
        item.price,
    )
    return CatalogItemOut.model_validate(item)


@admin_router.put(
    "/{item_id}",
    response_model=CatalogItemOut,
    summary="Actualiza un item del catálogo (admin). Campos parciales.",
)
def update_catalog_item(
    item_id: UUID,
    payload: CatalogItemUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CatalogItemOut:
    item = db.scalar(select(CatalogItem).where(CatalogItem.id == item_id))
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")

    data = payload.model_dump(exclude_none=True)
    if "image_url" in data and data["image_url"] is not None:
        data["image_url"] = str(data["image_url"])  # HttpUrl → str para SQLA

    for field, value in data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)

    logger.info(
        "catalog.update admin_id=%s item_id=%s fields=%s",
        admin.id,
        item.id,
        list(data.keys()),
    )
    return CatalogItemOut.model_validate(item)


@admin_router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete (is_active=False) — preserva historial en invoices.",
)
def delete_catalog_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Response:
    item = db.scalar(select(CatalogItem).where(CatalogItem.id == item_id))
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")

    if item.is_active:
        item.is_active = False
        db.commit()
        logger.warning(
            "catalog.soft_delete admin_id=%s item_id=%s",
            admin.id,
            item.id,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
