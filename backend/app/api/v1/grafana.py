"""Grafana endpoints — CRUD admin de dashboards embebibles (FASE 9).

Spec:
- Orquestor.md §FASE 9 (Grafana Integration)
- R5 ORM puro · R13 Logging de mutaciones · R17 sin "/" final

MAQUETA — esta versión solo gestiona el catálogo de dashboards. El proxy
con `Authorization: Bearer GRAFANA_API_KEY` que oculta el token al browser
se cierra en FASE 11. El endpoint proxy queda esbozado abajo (501) para
que el frontend pueda integrarse desde ya con el shape final.

Endpoints:
    POST   /admin/grafana          — crea dashboard
    GET    /admin/grafana          — lista (admin completa, público
                                     filtra is_active=True via query)
    PATCH  /admin/grafana/{id}     — actualización parcial
    DELETE /admin/grafana/{id}     — soft delete (is_active=False)
    GET    /admin/grafana/{id}/proxy — TODO sweep FASE 11
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.core.config import settings
from app.models.grafana_dashboard import GrafanaDashboard
from app.models.user import User
from app.schemas.grafana import (
    GrafanaDashboardCreateIn,
    GrafanaDashboardListOut,
    GrafanaDashboardOut,
    GrafanaDashboardUpdateIn,
)

logger = logging.getLogger("tundra.grafana")
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# POST /admin/grafana
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=GrafanaDashboardOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registra un dashboard de Grafana en el panel.",
)
def create_dashboard(
    payload: GrafanaDashboardCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> GrafanaDashboardOut:
    # UID único — verificación temprana para mejor mensaje de error
    # (la BD también lo bloquea con el unique index).
    existing = db.scalar(
        select(GrafanaDashboard).where(GrafanaDashboard.uid == payload.uid)
    )
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Dashboard with uid={payload.uid} already exists",
        )

    dashboard = GrafanaDashboard(
        name=payload.name,
        uid=payload.uid,
        url_embed=str(payload.url_embed),
        variables=payload.variables,
        is_active=payload.is_active,
        display_order=payload.display_order,
    )
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)

    logger.info(
        "grafana.create admin_id=%s dashboard_id=%s uid=%s",
        admin.id,
        dashboard.id,
        dashboard.uid,
    )
    return GrafanaDashboardOut.model_validate(dashboard)


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/grafana
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=GrafanaDashboardListOut,
    summary="Lista dashboards. Por default solo activos.",
)
def list_dashboards(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> GrafanaDashboardListOut:
    stmt = select(GrafanaDashboard).order_by(
        asc(GrafanaDashboard.display_order),
        asc(GrafanaDashboard.created_at),
    )
    if not include_inactive:
        stmt = stmt.where(GrafanaDashboard.is_active.is_(True))

    rows = list(db.scalars(stmt).all())
    return GrafanaDashboardListOut(
        items=[GrafanaDashboardOut.model_validate(d) for d in rows],
        total=len(rows),
    )


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /admin/grafana/{id}
# ─────────────────────────────────────────────────────────────────────────────


@router.patch(
    "/{dashboard_id}",
    response_model=GrafanaDashboardOut,
    summary="Actualiza dashboard (campos parciales).",
)
def update_dashboard(
    dashboard_id: UUID,
    payload: GrafanaDashboardUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> GrafanaDashboardOut:
    dashboard = db.scalar(
        select(GrafanaDashboard).where(GrafanaDashboard.id == dashboard_id)
    )
    if dashboard is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")

    data = payload.model_dump(exclude_none=True)
    if "url_embed" in data:
        data["url_embed"] = str(data["url_embed"])

    for field, value in data.items():
        setattr(dashboard, field, value)

    db.commit()
    db.refresh(dashboard)

    logger.info(
        "grafana.update admin_id=%s dashboard_id=%s fields=%s",
        admin.id,
        dashboard.id,
        list(data.keys()),
    )
    return GrafanaDashboardOut.model_validate(dashboard)


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /admin/grafana/{id}  (soft delete)
# ─────────────────────────────────────────────────────────────────────────────


@router.delete(
    "/{dashboard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete (is_active=False).",
)
def delete_dashboard(
    dashboard_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Response:
    dashboard = db.scalar(
        select(GrafanaDashboard).where(GrafanaDashboard.id == dashboard_id)
    )
    if dashboard is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")

    if dashboard.is_active:
        dashboard.is_active = False
        db.commit()
        logger.warning(
            "grafana.soft_delete admin_id=%s dashboard_id=%s uid=%s",
            admin.id,
            dashboard.id,
            dashboard.uid,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/grafana/{id}/proxy   (MAQUETA — sweep FASE 11)
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/{dashboard_id}/proxy",
    summary="(Stub) Proxy seguro al dashboard. Implementación en FASE 11.",
)
def proxy_dashboard(
    dashboard_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Response:
    dashboard = db.scalar(
        select(GrafanaDashboard).where(GrafanaDashboard.id == dashboard_id)
    )
    if dashboard is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")

    # TODO (sweep FASE 11) — Grafana es SELF-HOSTED:
    #   1. Leer settings.GRAFANA_URL + settings.GRAFANA_SERVICE_ACCOUNT_TOKEN.
    #   2. httpx.AsyncClient.get(f"{GRAFANA_URL}/d-solo/{dashboard.uid}...",
    #          headers={"Authorization": f"Bearer {token}"})
    #   3. Reescribir <base href> y srcs para que apunten al proxy y no
    #      filtren la URL original ni el token.
    #   4. Devolver el HTML como Response(media_type="text/html").
    #
    # Hoy: 501 explícito para que el frontend sepa que está en maqueta.
    grafana_configured = bool(
        settings.GRAFANA_URL and settings.GRAFANA_SERVICE_ACCOUNT_TOKEN
    )
    logger.info(
        "grafana.proxy.stub admin_id=%s dashboard_id=%s configured=%s",
        admin.id,
        dashboard.id,
        grafana_configured,
    )
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "Proxy de Grafana se implementa en FASE 11 (sweep de integraciones).",
    )
