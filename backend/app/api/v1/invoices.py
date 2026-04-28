"""Invoices endpoints — checkout y consultas.

Spec:
- Orquestor.md §FASE 3 + mapa de endpoints §Facturas
- R4 IDOR: GET /invoices/{id} verifica ownership (o admin)
- R5 ORM puro
- R9 Validación TOTAL server-side: precios y stock se recalculan contra BD,
     el cliente nunca dicta el monto final (anti-patrón #5)
- R13 Logging de cada checkout (auditable)
- R17 Prefijo sin "/" final

Endpoints:
    POST /invoices/checkout                    — crea factura PRODUCT_SALE | INTERNET_SERVICE
    GET  /invoices/my-invoices                 — facturas del usuario actual
    GET  /invoices/{id}                        — detalle (con check IDOR)
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.catalog_item import CatalogItem
from app.models.invoice import Invoice
from app.models.service import Service
from app.models.user import User
from app.schemas.invoice import (
    CheckoutIn,
    InternetServiceCheckoutIn,
    InvoiceListOut,
    InvoiceOut,
    ProductSaleCheckoutIn,
)

logger = logging.getLogger("tundra.invoices")
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# POST /invoices/checkout
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/checkout",
    response_model=InvoiceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una factura PRODUCT_SALE o INTERNET_SERVICE.",
)
def checkout(
    payload: CheckoutIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvoiceOut:
    if isinstance(payload, ProductSaleCheckoutIn):
        invoice = _checkout_product_sale(db, current_user, payload)
    elif isinstance(payload, InternetServiceCheckoutIn):
        invoice = _checkout_internet_service(db, current_user, payload)
    else:  # pragma: no cover — discriminator garantiza que no llegamos aquí
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Unsupported checkout type"
        )

    logger.info(
        "invoices.checkout.ok user_id=%s invoice_id=%s tipo=%s total=%s",
        current_user.id,
        invoice.id,
        invoice.tipo,
        invoice.total,
    )
    return InvoiceOut.model_validate(invoice)


def _checkout_product_sale(
    db: Session,
    user: User,
    payload: ProductSaleCheckoutIn,
) -> Invoice:
    """Crea Invoice PRODUCT_SALE con re-validación total contra BD."""
    item_ids = [line.item_id for line in payload.items]

    # Lock pesimista para que dos checkouts simultáneos no sobre-vendan stock.
    items_db = list(
        db.scalars(
            select(CatalogItem)
            .where(CatalogItem.id.in_(item_ids))
            .with_for_update()
        ).all()
    )
    items_by_id = {item.id: item for item in items_db}

    # Validar que todos los items existen y están activos.
    for line in payload.items:
        item = items_by_id.get(line.item_id)
        if item is None or not item.is_active:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Item not available: {line.item_id}",
            )
        if item.stock < line.quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Insufficient stock for '{item.name}' (available: {item.stock})",
            )

    # Construir snapshot y montos con precios ACTUALES de BD.
    items_snapshot: list[dict[str, Any]] = []
    subtotal = Decimal("0.00")
    for line in payload.items:
        item = items_by_id[line.item_id]
        unit_price = item.price.quantize(Decimal("0.01"))
        line_subtotal = (unit_price * line.quantity).quantize(Decimal("0.01"))
        items_snapshot.append(
            {
                "item_id": str(item.id),
                "name": item.name,
                "unit_price": str(unit_price),
                "quantity": line.quantity,
                "subtotal": str(line_subtotal),
            }
        )
        subtotal += line_subtotal
        # Decrementa stock.
        item.stock = item.stock - line.quantity

    tax_amount = Decimal("0.00")  # No hay IVA configurado en el spec hoy.
    total = (subtotal + tax_amount).quantize(Decimal("0.01"))

    invoice = Invoice(
        user_id=user.id,
        tipo="PRODUCT_SALE",
        estado="pending",
        subtotal=subtotal.quantize(Decimal("0.01")),
        tax_amount=tax_amount,
        total=total,
        items=items_snapshot,
        direccion_instalacion=None,
        plan_seleccionado=None,
        extra_data={},
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def _checkout_internet_service(
    db: Session,
    user: User,
    payload: InternetServiceCheckoutIn,
) -> Invoice:
    """Crea Invoice INTERNET_SERVICE validando service + plan contra BD."""
    service = db.scalar(
        select(Service).where(Service.id == payload.service_id)
    )
    if service is None or not service.is_active:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Service not available: {payload.service_id}",
        )

    plan = service.find_plan(payload.plan_id)
    if plan is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Plan not found in service: {payload.plan_id}",
        )

    # Precios actuales del servicio/plan, NO del cliente.
    try:
        precio_mensual = Decimal(str(plan["precio_mensual"])).quantize(Decimal("0.01"))
    except (KeyError, ValueError, TypeError) as exc:
        logger.error(
            "invoices.checkout.internet.bad_plan service_id=%s plan_id=%s err=%s",
            service.id,
            payload.plan_id,
            exc,
        )
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Plan data is malformed",
        ) from None

    precio_instalacion = service.precio_instalacion_base.quantize(Decimal("0.01"))

    plan_snapshot: dict[str, Any] = {
        "service_id": str(service.id),
        "service_slug": service.slug,
        "plan_id": plan.get("id"),
        "nombre": plan.get("nombre"),
        "velocidad": plan.get("velocidad"),
        "tipo_plan": plan.get("tipo_plan"),
        "precio_mensual": str(precio_mensual),
        "precio_instalacion": str(precio_instalacion),
    }

    subtotal = (precio_instalacion + precio_mensual).quantize(Decimal("0.01"))
    tax_amount = Decimal("0.00")
    total = (subtotal + tax_amount).quantize(Decimal("0.01"))

    invoice = Invoice(
        user_id=user.id,
        tipo="INTERNET_SERVICE",
        estado="pending",
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        items=[],
        direccion_instalacion=payload.direccion_instalacion,
        plan_seleccionado=plan_snapshot,
        extra_data={},
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


# ─────────────────────────────────────────────────────────────────────────────
# GET /invoices/my-invoices
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/my-invoices",
    response_model=InvoiceListOut,
    summary="Facturas del usuario autenticado, ordenadas por fecha desc.",
)
def my_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvoiceListOut:
    stmt = (
        select(Invoice)
        .where(Invoice.user_id == current_user.id)
        .order_by(Invoice.created_at.desc())
    )
    invoices = list(db.scalars(stmt).all())
    return InvoiceListOut(
        items=[InvoiceOut.model_validate(inv) for inv in invoices],
        total=len(invoices),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /invoices/{id}  (R4 IDOR-protected)
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/{invoice_id}",
    response_model=InvoiceOut,
    summary="Detalle de una factura. Solo el dueño o un admin pueden verla.",
)
def get_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvoiceOut:
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id))
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    # R4: ownership check OR admin.
    if invoice.user_id != current_user.id and not current_user.is_admin:
        logger.warning(
            "invoices.get.idor user_id=%s invoice_id=%s owner_id=%s",
            current_user.id,
            invoice.id,
            invoice.user_id,
        )
        # 404 (no 403) → no leak de existencia.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    return InvoiceOut.model_validate(invoice)
