"""Auth endpoints — register, login (con bootstrap admin), verify, logout.

Spec:
- Orquestor.md §FASE 1
- R3 Auth dual (este módulo cubre JWT; X-API-Key en /admin/api-keys)
- R9 Validación server-side total
- R12 Rate limiting en endpoints sensibles
- R13 Logging de eventos auth
- Bootstrap admin: el identifier "admin" se reserva para la cuenta
  administradora. El primer login con "admin" + cualquier password fija
  el password definitivo. Para resetear desde código:
      UPDATE users SET hashed_password=NULL WHERE email='admin';
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.user import (
    ADMIN_IDENTIFIER,
    AuthTokensOut,
    UserLoginIn,
    UserOut,
    UserRegisterIn,
)

logger = logging.getLogger("tundra.auth")
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _build_tokens(user: User) -> AuthTokensOut:
    access = create_access_token(user_id=user.id, is_admin=user.is_admin)
    refresh = create_refresh_token(user_id=user.id)
    return AuthTokensOut(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserOut.model_validate(user),
    )


def _client_ip(request: Request) -> str:
    """IP del cliente respetando X-Forwarded-For si Nginx está delante."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─────────────────────────────────────────────────────────────────────────────
# POST /auth/register
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/register",
    response_model=AuthTokensOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registro de usuario nuevo (cliente).",
)
@limiter.limit(settings.RATE_LIMIT_REGISTER)
def register(
    request: Request,
    payload: UserRegisterIn,
    db: Session = Depends(get_db),
) -> AuthTokensOut:
    email_norm = payload.email.lower().strip()

    # El identifier "admin" no es registrable — solo se crea vía bootstrap login.
    if email_norm == ADMIN_IDENTIFIER:
        logger.warning(
            "auth.register.blocked_admin ip=%s",
            _client_ip(request),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifier reserved",
        )

    existing = db.scalar(select(User).where(User.email == email_norm))
    if existing is not None:
        # Mensaje genérico — no revelar si el email existe (anti enumeration).
        logger.info("auth.register.duplicate email=%s ip=%s", email_norm, _client_ip(request))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not register with the provided data",
        )

    user = User(
        email=email_norm,
        hashed_password=hash_password(payload.password.get_secret_value()),
        is_admin=False,
        first_name=payload.first_name,
        last_name=payload.last_name,
        account_type=payload.account_type,
        is_active=True,
        email_verified=False,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.warning(
            "auth.register.race email=%s ip=%s",
            email_norm,
            _client_ip(request),
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not register with the provided data",
        )
    db.refresh(user)

    logger.info(
        "auth.register.ok user_id=%s email=%s ip=%s",
        user.id,
        email_norm,
        _client_ip(request),
    )
    return _build_tokens(user)


# ─────────────────────────────────────────────────────────────────────────────
# POST /auth/login
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/login",
    response_model=AuthTokensOut,
    summary="Login con email/password. El identifier 'admin' usa bootstrap.",
)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(
    request: Request,
    payload: UserLoginIn,
    db: Session = Depends(get_db),
) -> AuthTokensOut:
    identifier = payload.email  # ya lowercased + validado en el schema
    plain_password = payload.password.get_secret_value()
    ip = _client_ip(request)

    # ── Caso especial: bootstrap del administrador ──────────────────────────
    if identifier == ADMIN_IDENTIFIER:
        return _login_admin(db=db, plain_password=plain_password, ip=ip)

    # ── Login normal ────────────────────────────────────────────────────────
    user = db.scalar(select(User).where(User.email == identifier))
    if (
        user is None
        or not user.hashed_password
        or not verify_password(plain_password, user.hashed_password)
    ):
        logger.warning("auth.login.fail email=%s ip=%s", identifier, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not user.is_active:
        logger.warning("auth.login.inactive user_id=%s ip=%s", user.id, ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    logger.info("auth.login.ok user_id=%s ip=%s", user.id, ip)
    return _build_tokens(user)


def _login_admin(*, db: Session, plain_password: str, ip: str) -> AuthTokensOut:
    """Bootstrap-aware admin login.

    Lock pesimista para prevenir doble-bootstrap simultáneo.
    """
    admin = db.scalar(
        select(User).where(User.email == ADMIN_IDENTIFIER).with_for_update()
    )

    if admin is None:
        # Primera vez: crea la cuenta admin con el password recibido.
        admin = User(
            email=ADMIN_IDENTIFIER,
            hashed_password=hash_password(plain_password),
            is_admin=True,
            is_active=True,
            email_verified=True,
            account_type="empresa",
            first_name="Administrador",
        )
        db.add(admin)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.error("auth.login.admin.bootstrap_race ip=%s", ip)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bootstrap conflict, retry",
            )
        db.refresh(admin)
        logger.warning(
            "auth.login.admin.bootstrap_created user_id=%s ip=%s",
            admin.id,
            ip,
        )
        return _build_tokens(admin)

    # Si existe pero NO tiene password (reset manual desde código), re-bootstrap.
    if not admin.hashed_password:
        admin.hashed_password = hash_password(plain_password)
        db.commit()
        db.refresh(admin)
        logger.warning(
            "auth.login.admin.bootstrap_repaired user_id=%s ip=%s",
            admin.id,
            ip,
        )
        return _build_tokens(admin)

    # Camino normal: verifica password.
    if not verify_password(plain_password, admin.hashed_password):
        logger.warning("auth.login.admin.fail ip=%s", ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not admin.is_active:
        logger.error("auth.login.admin.inactive ip=%s", ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    logger.info("auth.login.admin.ok user_id=%s ip=%s", admin.id, ip)
    return _build_tokens(admin)


# ─────────────────────────────────────────────────────────────────────────────
# GET /auth/verify
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/verify",
    response_model=UserOut,
    summary="Devuelve el usuario asociado al JWT actual.",
)
def verify(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


# ─────────────────────────────────────────────────────────────────────────────
# POST /auth/logout (stateless: el cliente descarta el token)
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout cliente. La revocación real entra con revoked_token (FASE 5+).",
)
def logout(current_user: User = Depends(get_current_user)) -> None:
    logger.info("auth.logout user_id=%s", current_user.id)
    return None
