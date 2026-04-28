"""API Keys endpoints — CRUD para X-API-Key (admin only).

Spec:
- Orquestor.md §FASE 8 + mapa endpoints
- R3 X-API-Key SHA-256 — el plain solo se muestra UNA VEZ
- R5 ORM puro
- R13 Logging de creaciones y revocaciones (auditable)
- R17 Prefijo sin "/" final

Endpoints:
    POST   /admin/api-keys
    GET    /admin/api-keys
    DELETE /admin/api-keys/{id}     (soft delete: is_active=False)
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.core.security import generate_api_key
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.admin import (
    ApiKeyCreatedOut,
    ApiKeyCreateIn,
    ApiKeyListOut,
    ApiKeyOut,
)

logger = logging.getLogger("tundra.api_keys")
router = APIRouter()


def _to_out(key: ApiKey) -> ApiKeyOut:
    out = ApiKeyOut.model_validate(key)
    out.is_usable = key.is_usable
    return out


# ─────────────────────────────────────────────────────────────────────────────
# POST /admin/api-keys
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=ApiKeyCreatedOut,
    status_code=status.HTTP_201_CREATED,
    summary=(
        "Crea una API key. Devuelve el plain UNA SOLA VEZ — el admin "
        "debe copiarlo, no se podrá recuperar después."
    ),
)
def create_api_key(
    payload: ApiKeyCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ApiKeyCreatedOut:
    target_user_id = payload.user_id or admin.id

    # Si se pasa user_id explícito, validar que el user exista.
    if payload.user_id is not None:
        target = db.scalar(select(User).where(User.id == payload.user_id))
        if target is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Target user does not exist",
            )

    plain, hashed = generate_api_key()
    api_key = ApiKey(
        user_id=target_user_id,
        name=payload.name,
        key_hash=hashed,
        scopes=list(payload.scopes),
        expires_at=payload.expires_at,
        is_active=True,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    logger.warning(
        "api_keys.create admin_id=%s key_id=%s for_user=%s name=%s scopes=%s",
        admin.id,
        api_key.id,
        target_user_id,
        api_key.name,
        api_key.scopes,
    )

    return ApiKeyCreatedOut(
        api_key=_to_out(api_key),
        plain_key=plain,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /admin/api-keys
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=ApiKeyListOut,
    summary="Lista todas las API keys (admin).",
)
def list_api_keys(
    include_revoked: bool = False,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> ApiKeyListOut:
    stmt = select(ApiKey).order_by(desc(ApiKey.created_at))
    if not include_revoked:
        stmt = stmt.where(ApiKey.is_active.is_(True))

    rows = list(db.scalars(stmt).all())
    return ApiKeyListOut(
        items=[_to_out(k) for k in rows],
        total=len(rows),
    )


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /admin/api-keys/{id}  (soft delete — preserva auditoría)
# ─────────────────────────────────────────────────────────────────────────────


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoca una API key (soft delete: is_active=False).",
)
def revoke_api_key(
    key_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Response:
    key = db.scalar(select(ApiKey).where(ApiKey.id == key_id))
    if key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")

    if key.is_active:
        key.is_active = False
        db.commit()
        logger.warning(
            "api_keys.revoke admin_id=%s key_id=%s name=%s",
            admin.id,
            key.id,
            key.name,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
