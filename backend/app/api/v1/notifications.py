"""Notifications endpoints — listado, mark-read, delete.

Spec:
- Orquestor.md §FASE 5 + mapa de endpoints §Notificaciones
- R4 IDOR en cada notificación individual
- R5 ORM puro
- R13 Logging de mark-all-read (acción masiva auditable)
- R17 Prefijo sin "/" final

Endpoints:
    GET    /notifications                    (lista, filtros opcionales)
    GET    /notifications/unread-count
    PUT    /notifications/{id}/read
    PUT    /notifications/mark-all-read
    DELETE /notifications/{id}
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import desc, func, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    NotificationListOut,
    NotificationOut,
    UnreadCountOut,
)

logger = logging.getLogger("tundra.notifications")
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=NotificationListOut,
    summary="Notificaciones del usuario actual.",
)
def list_notifications(
    only_unread: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationListOut:
    stmt = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .limit(limit)
    )
    if only_unread:
        stmt = stmt.where(Notification.read_at.is_(None))

    rows = list(db.scalars(stmt).all())
    return NotificationListOut(
        items=[NotificationOut.model_validate(n) for n in rows],
        total=len(rows),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications/unread-count
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/unread-count",
    response_model=UnreadCountOut,
    summary="Cantidad de notificaciones sin leer del usuario actual.",
)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountOut:
    n = (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == current_user.id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )
    return UnreadCountOut(unread=int(n))


# ─────────────────────────────────────────────────────────────────────────────
# PUT /notifications/{id}/read
# ─────────────────────────────────────────────────────────────────────────────


@router.put(
    "/mark-all-read",
    response_model=UnreadCountOut,
    summary="Marca TODAS las notificaciones del usuario como leídas.",
)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountOut:
    now = datetime.now(timezone.utc)
    result = db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.read_at.is_(None),
        )
        .values(read_at=now)
    )
    db.commit()
    affected = int(result.rowcount or 0)
    logger.info(
        "notifications.mark_all_read user_id=%s count=%s",
        current_user.id,
        affected,
    )
    return UnreadCountOut(unread=0)


@router.put(
    "/{notification_id}/read",
    response_model=NotificationOut,
    summary="Marca una notificación como leída (con check IDOR).",
)
def mark_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationOut:
    notif = db.scalar(
        select(Notification).where(Notification.id == notification_id)
    )
    if notif is None or notif.user_id != current_user.id:
        # 404 sobre ajeno (no leak de existencia, R4 consistente)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")

    if notif.read_at is None:
        notif.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notif)

    return NotificationOut.model_validate(notif)


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /notifications/{id}
# ─────────────────────────────────────────────────────────────────────────────


@router.delete(
    "/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Elimina una notificación (con check IDOR).",
)
def delete_notification(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    notif = db.scalar(
        select(Notification).where(Notification.id == notification_id)
    )
    if notif is None or notif.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")

    db.delete(notif)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
