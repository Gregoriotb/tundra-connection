"""Admin endpoints — agregadores y export.

Spec:
- Orquestor.md §FASE 8 + mapa endpoints §Admin
- R5 ORM puro
- R13 Logging del export (acción auditable)
- R17 Prefijo sin "/" final

Endpoints:
    GET /admin/export-all   — snapshot agregado de todas las entidades
    GET /admin/stats        — KPIs para el dashboard inicial
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models.api_key import ApiKey
from app.models.catalog_item import CatalogItem
from app.models.invoice import Invoice
from app.models.notification import Notification
from app.models.quotation_thread import QuotationThread
from app.models.service import Service
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.admin import (
    AdminStatsOut,
    ExportAllOut,
    StatsCardOut,
)

logger = logging.getLogger("tundra.admin")
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/export-all
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/export-all",
    response_model=ExportAllOut,
    summary="Snapshot agregado del sistema (counts + KPIs operativos).",
)
def export_all(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ExportAllOut:
    counts = {
        "users": _count(db, User),
        "catalog_items": _count(db, CatalogItem),
        "services": _count(db, Service),
        "invoices": _count(db, Invoice),
        "quotation_threads": _count(db, QuotationThread),
        "support_tickets": _count(db, SupportTicket),
        "notifications": _count(db, Notification),
        "api_keys": _count(db, ApiKey),
    }

    invoices_total = db.scalar(
        select(func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.estado == "paid"
        )
    ) or 0

    open_tickets = (
        db.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.estado.notin_(("solucionado", "cancelado")))
        )
        or 0
    )

    pending_quotations = (
        db.scalar(
            select(func.count())
            .select_from(QuotationThread)
            .where(QuotationThread.estado.in_(("pending", "active", "negotiating")))
        )
        or 0
    )

    active_api_keys = (
        db.scalar(
            select(func.count())
            .select_from(ApiKey)
            .where(ApiKey.is_active.is_(True))
        )
        or 0
    )

    logger.info(
        "admin.export_all admin_id=%s users=%s invoices_total=%s",
        admin.id,
        counts["users"],
        invoices_total,
    )

    return ExportAllOut(
        generated_at=datetime.now(timezone.utc),
        counts=counts,
        invoices_total_amount=invoices_total,
        open_tickets=int(open_tickets),
        pending_quotations=int(pending_quotations),
        active_api_keys=int(active_api_keys),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/stats
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/stats",
    response_model=AdminStatsOut,
    summary="KPIs principales para el dashboard admin.",
)
def admin_stats(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> AdminStatsOut:
    users_total = _count(db, User)
    invoices_paid = (
        db.scalar(
            select(func.count())
            .select_from(Invoice)
            .where(Invoice.estado == "paid")
        )
        or 0
    )
    invoices_pending = (
        db.scalar(
            select(func.count())
            .select_from(Invoice)
            .where(Invoice.estado == "pending")
        )
        or 0
    )
    open_tickets = (
        db.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.estado.notin_(("solucionado", "cancelado")))
        )
        or 0
    )
    critical_tickets = (
        db.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(
                SupportTicket.prioridad == "critica",
                SupportTicket.estado.notin_(("solucionado", "cancelado")),
            )
        )
        or 0
    )

    cards: list[StatsCardOut] = [
        StatsCardOut(
            key="users_total",
            label="Usuarios registrados",
            value=int(users_total),
            tone="neutral",
        ),
        StatsCardOut(
            key="invoices_paid",
            label="Facturas pagadas",
            value=int(invoices_paid),
            tone="good",
        ),
        StatsCardOut(
            key="invoices_pending",
            label="Facturas pendientes",
            value=int(invoices_pending),
            tone="warn" if invoices_pending > 0 else "neutral",
        ),
        StatsCardOut(
            key="tickets_open",
            label="Tickets abiertos",
            value=int(open_tickets),
            tone="warn" if open_tickets > 5 else "neutral",
        ),
        StatsCardOut(
            key="tickets_critical",
            label="Tickets críticos",
            value=int(critical_tickets),
            tone="danger" if critical_tickets > 0 else "neutral",
        ),
    ]
    return AdminStatsOut(
        cards=cards,
        generated_at=datetime.now(timezone.utc),
    )


# ─── Helpers ──────────────────────────────────────────────────────────────


def _count(db: Session, model: type) -> int:
    return int(db.scalar(select(func.count()).select_from(model)) or 0)
