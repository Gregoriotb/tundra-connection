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
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
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


# ─────────────────────────────────────────────────────────────────────────────
# Google OAuth (FASE 7 — MAQUETA)
#
# Esta es una implementación stub. El flow real de Google OAuth se integra
# en la fase de "Integraciones reales" al final del proyecto.
#
# Cuando se integre:
#   1. Reemplazar `_GOOGLE_AUTH_URL_STUB` por construcción real con
#      `GOOGLE_CLIENT_ID` y endpoint accounts.google.com/o/oauth2/v2/auth.
#   2. En `/callback`, intercambiar `code` por tokens contra
#      oauth2.googleapis.com/token y obtener id_token + userinfo.
#   3. Validar id_token (firma, audience).
#   4. Buscar/crear User por `google_id` o `email`.
#   5. Marcar email_verified=True (Google ya verificó).
#
# Por ahora el endpoint /login devuelve una URL placeholder y /callback
# acepta cualquier `code` y retorna 501 explícito si las credenciales no
# están configuradas.
# ─────────────────────────────────────────────────────────────────────────────


_GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"


@router.get(
    "/google/login",
    summary="Inicia flow OAuth Google. Devuelve URL para redirigir al cliente.",
)
def google_login() -> dict[str, str]:
    """Stub: construye la URL de autorización Google.

    El cliente recibe `{authorize_url}` y hace `window.location.href = ...`
    Si las credenciales no están configuradas (modo maqueta), devuelve
    una URL placeholder para que la UI muestre el flow sin error.
    """
    if not settings.GOOGLE_CLIENT_ID:
        # MAQUETA: URL placeholder para que el frontend no rompa.
        return {
            "authorize_url": "/oauth-stub?provider=google&note=oauth_not_configured",
            "configured": "false",
        }

    state = secrets.token_urlsafe(24)  # Anti-CSRF
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    return {
        "authorize_url": f"{_GOOGLE_AUTHORIZE_ENDPOINT}?{urlencode(params)}",
        "state": state,
        "configured": "true",
    }


@router.get(
    "/google/callback",
    summary="Callback de Google OAuth (stub maqueta).",
)
def google_callback(
    code: str = Query(...),
    state: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Stub: aún no intercambia el code por tokens reales.

    En la integración final:
      1. POST a oauth2.googleapis.com/token con code.
      2. Decodificar id_token, validar firma, audience, exp.
      3. Buscar User por google_id; si no existe, buscar por email.
      4. Crear / actualizar User, redirigir al frontend con un JWT propio.

    En modo maqueta, devuelve 501 si no hay credenciales — el frontend
    muestra el mensaje de "OAuth pendiente de configurar".
    """
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        logger.warning("auth.google.callback.not_configured")
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                "Google OAuth no está configurado en este entorno. "
                "Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET para habilitar."
            ),
        )

    # TODO (integración final): intercambiar code → tokens, buscar/crear user.
    # Hoy: redirige al frontend con un mensaje placeholder.
    redirect_url = (
        f"{settings.FRONTEND_URL}/oauth/callback?status=stub&code={code[:8]}…"
    )
    logger.info("auth.google.callback.stub code_prefix=%s", code[:8])
    return RedirectResponse(url=redirect_url)


# ─────────────────────────────────────────────────────────────────────────────
# Password change (referenciado por authApi.changePassword en frontend)
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cambia el password del usuario autenticado.",
)
def change_password(
    payload: "PasswordChangePayload",  # forward ref para evitar import circular
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    from app.schemas.user import PasswordChangeIn

    body = PasswordChangeIn.model_validate(payload)
    if not current_user.hashed_password or not verify_password(
        body.current_password.get_secret_value(), current_user.hashed_password
    ):
        logger.warning("auth.password.bad_current user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.hashed_password = hash_password(
        body.new_password.get_secret_value()
    )
    db.commit()
    logger.info("auth.password.changed user_id=%s", current_user.id)


# Forward-ref alias para que FastAPI parse el body correctamente.
from app.schemas.user import PasswordChangeIn as PasswordChangePayload  # noqa: E402,F401
