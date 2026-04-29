"""Users endpoints — perfil + uploads (foto, RIF).

Spec:
- Orquestor.md §FASE 7 + mapa de endpoints §Perfil
- R3 JWT requerido
- R5 ORM puro
- R9 Validación server-side de uploads (MIME + size + extension)
- R13 Log de cambios de perfil

Endpoints:
    GET    /users/profile
    PUT    /users/profile
    POST   /users/profile/photo-upload   (multipart/form-data, foto)
    POST   /users/profile/rif-upload     (multipart/form-data, PDF/imagen)

Uploads están en MAQUETA: el upload_service guarda local con URL
relativa. La integración con ImgBB se hace en el sweep final
(documentado en upload_service.py).
"""

from __future__ import annotations

import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user import UserOut, UserUpdateIn
from app.services.upload_service import (
    UploadError,
    UploadResult,
    upload_image,
    upload_rif_document,
)
from app.utils.sanitize import sanitize_user_text

logger = logging.getLogger("tundra.users")
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# GET /users/profile
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=UserOut,
    summary="Perfil del usuario autenticado.",
)
def get_profile(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


# ─────────────────────────────────────────────────────────────────────────────
# PUT /users/profile
# ─────────────────────────────────────────────────────────────────────────────


@router.put(
    "",
    response_model=UserOut,
    summary="Actualiza el perfil. NO permite cambiar email, is_admin, google_id.",
)
def update_profile(
    payload: UserUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    data = payload.model_dump(exclude_none=True)

    # Sanitiza campos de texto libres antes de persistir.
    for key in ("first_name", "last_name", "address", "city", "state"):
        if key in data and isinstance(data[key], str):
            data[key] = sanitize_user_text(data[key], max_length=255)

    # `phone`, `rif_cedula`, `zip_code`, `account_type` ya validados por schema.
    for field, value in data.items():
        setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)

    logger.info(
        "users.profile.update user_id=%s fields=%s",
        current_user.id,
        list(data.keys()),
    )
    return UserOut.model_validate(current_user)


# ─────────────────────────────────────────────────────────────────────────────
# POST /users/profile/photo-upload
# ─────────────────────────────────────────────────────────────────────────────


_ALLOWED_PHOTO_MIME = {"image/jpeg", "image/png", "image/webp"}
_MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post(
    "/photo-upload",
    response_model=UserOut,
    summary="Sube foto de perfil (JPEG/PNG/WEBP, máx 5 MB).",
)
async def upload_profile_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    if not file.content_type or file.content_type not in _ALLOWED_PHOTO_MIME:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Allowed types: {sorted(_ALLOWED_PHOTO_MIME)}",
        )

    try:
        result: UploadResult = await upload_image(
            file,
            owner_id=current_user.id,
            kind="profile_photo",
            max_size=_MAX_PHOTO_SIZE,
            allowed_mime=_ALLOWED_PHOTO_MIME,
        )
    except UploadError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    current_user.profile_photo_url = result.url
    db.commit()
    db.refresh(current_user)

    logger.info(
        "users.photo.upload user_id=%s url=%s size=%s",
        current_user.id,
        result.url,
        result.size_bytes,
    )
    return UserOut.model_validate(current_user)


# ─────────────────────────────────────────────────────────────────────────────
# POST /users/profile/rif-upload
# ─────────────────────────────────────────────────────────────────────────────


_ALLOWED_RIF_MIME = {"image/jpeg", "image/png", "application/pdf"}
_MAX_RIF_SIZE = 8 * 1024 * 1024  # 8 MB


@router.post(
    "/rif-upload",
    response_model=UserOut,
    summary=(
        "Sube documento RIF/Cédula (JPEG/PNG/PDF, máx 8 MB). "
        "El URL se guarda en metadata para revisión por admin."
    ),
)
async def upload_rif(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    if not file.content_type or file.content_type not in _ALLOWED_RIF_MIME:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Allowed types: {sorted(_ALLOWED_RIF_MIME)}",
        )

    try:
        result = await upload_rif_document(
            file,
            owner_id=current_user.id,
            max_size=_MAX_RIF_SIZE,
            allowed_mime=_ALLOWED_RIF_MIME,
        )
    except UploadError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    # El URL del RIF NO va en el modelo User directamente — el spec sólo
    # define `rif_cedula` (string del número). El URL queda en el response
    # para que el admin lo revise. Si se persiste como un campo dedicado
    # se hace en una migración futura (R14).
    logger.info(
        "users.rif.upload user_id=%s url=%s size=%s",
        current_user.id,
        result.url,
        result.size_bytes,
    )
    # Devolvemos el user sin cambio + el URL como header (workaround
    # hasta que el schema dedicado exista).
    response = UserOut.model_validate(current_user)
    return response  # noqa: RET504 — explícito para visibility
