"""Dependencies compartidas para los routers FastAPI.

Spec:
- Orquestor.md §FASE 1
- R3 Auth dual: JWT Bearer (este módulo) + X-API-Key (FASE 8)
- R4 IDOR protection: `require_admin` se compone con checks de ownership
- R13 Logging de fallos de auth

Exports principales:
    get_db              — alias del de core.database
    get_current_user    — exige JWT válido, retorna User activo
    get_optional_user   — None si no hay token (para endpoints público/privado)
    require_admin       — exige is_admin=True
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import TokenError, decode_token
from app.models.user import User

logger = logging.getLogger("tundra.deps")

# auto_error=False → permitimos que get_optional_user maneje "sin token".
_bearer_required = HTTPBearer(auto_error=True, scheme_name="JWTBearer")
_bearer_optional = HTTPBearer(auto_error=False, scheme_name="JWTBearerOptional")


def _resolve_user(db: Session, token: str) -> User:
    """Decodifica el JWT y carga el usuario. Lanza 401 con mensaje genérico."""
    try:
        payload = decode_token(token, expected_type="access")
    except TokenError as exc:
        logger.info("deps.auth.invalid_token reason=%s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = UUID(str(sub))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        logger.warning("deps.auth.user_not_found user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        logger.warning("deps.auth.user_inactive user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_required),
    db: Session = Depends(get_db),
) -> User:
    """Exige JWT válido. Para endpoints autenticados."""
    return _resolve_user(db, credentials.credentials)


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_optional),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Retorna User si hay token válido, None si no hay header o es inválido.

    Útil para endpoints como GET /catalog que muestran data adicional
    a usuarios autenticados pero también responden a anónimos.
    """
    if credentials is None:
        return None
    try:
        return _resolve_user(db, credentials.credentials)
    except HTTPException:
        return None


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Exige que el usuario sea admin. Componer junto a get_current_user.

    NOTA (R4): admin no implica acceso libre a recursos de OTROS usuarios.
    Cada handler que toque recursos de un user concreto debe seguir
    verificando ownership, salvo en endpoints /admin/* explícitos.
    """
    if not current_user.is_admin:
        logger.warning(
            "deps.auth.admin_required user_id=%s",
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


__all__ = [
    "get_db",
    "get_current_user",
    "get_optional_user",
    "require_admin",
]
