"""Upload service — almacenamiento de archivos.

Spec:
- Orquestor.md §FASE 7
- R6 Upload resiliente: ImgBB primero, fallback local. Railway tiene FS efímero.
- R9 Validación: MIME real, tamaño, extensión.

MODO MAQUETA:
- Hoy guardamos local (UPLOAD_LOCAL_DIR) y servimos vía /uploads/...
- En la integración real (sweep final), `_upload_to_imgbb` se implementa
  contra la API de ImgBB y se invoca PRIMERO; si falla, cae al local.
- TODO marcado claramente abajo.

Estructura del módulo:
- `UploadResult` dataclass — lo que retornan las funciones.
- `UploadError` excepción — atrapada por los endpoints como 400.
- `upload_image(...)` — para fotos de perfil, adjuntos imagen.
- `upload_rif_document(...)` — para PDFs/imágenes de RIF.
- `_save_locally(...)` — implementación común que persiste en disco.
- `_upload_to_imgbb(...)` — STUB. NotImplementedError hasta integración.
"""

from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from fastapi import UploadFile

from app.core.config import settings
from app.utils.sanitize import sanitize_filename

logger = logging.getLogger("tundra.upload")


# ─── Tipos ────────────────────────────────────────────────────────────────


@dataclass
class UploadResult:
    """Resultado de un upload exitoso."""

    url: str
    filename: str
    mime_type: str
    size_bytes: int
    backend: str  # "imgbb" | "local" — útil para debugging y métricas


class UploadError(Exception):
    """Error en upload — el endpoint lo traduce a 400."""


# ─── Magic bytes (validación MIME real) ─────────────────────────────────────
# Defensa contra clientes que mandan content_type falso. En la integración
# final, sustituir por `python-magic` (libmagic) para cobertura completa.

_MAGIC_BYTES = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"],  # + check de "WEBP" en offset 8
    "application/pdf": [b"%PDF-"],
}


def _detect_mime_from_bytes(data: bytes) -> str | None:
    """Detecta MIME por magic bytes. Sólo cubre los tipos que aceptamos.

    Para WebP también verifica que en el offset 8 esté "WEBP" (RIFF
    también es WAV, AVI, etc.).
    """
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    return None


# ─── Helpers ──────────────────────────────────────────────────────────────


def _ext_from_mime(mime: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "application/pdf": ".pdf",
    }.get(mime, ".bin")


def _ensure_upload_dir() -> Path:
    base = Path(settings.UPLOAD_LOCAL_DIR)
    base.mkdir(parents=True, exist_ok=True)
    return base


async def _read_with_size_check(file: UploadFile, max_size: int) -> bytes:
    """Lee el archivo en memoria respetando el tope. Si excede, lanza UploadError.

    Lectura por chunks para detectar tamaño excesivo sin cargar todo.
    """
    chunk_size = 64 * 1024
    buf = bytearray()
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > max_size:
            raise UploadError(
                f"File too large (max {max_size // (1024 * 1024)} MB)"
            )
    return bytes(buf)


# ─── Backends ──────────────────────────────────────────────────────────────


async def _upload_to_imgbb(
    data: bytes, filename: str, mime: str
) -> UploadResult | None:
    """Stub para futura integración con ImgBB.

    TODO (sweep final):
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.imgbb.com/1/upload",
                params={"key": settings.IMGBB_API_KEY},
                files={"image": (filename, data, mime)},
            )
            res.raise_for_status()
            payload = res.json()
            return UploadResult(
                url=payload["data"]["url"],
                filename=filename,
                mime_type=mime,
                size_bytes=len(data),
                backend="imgbb",
            )

    En modo maqueta: retorna None para que el caller use fallback local.
    """
    if not settings.IMGBB_API_KEY:
        return None
    # Cuando se integre, retornar UploadResult acá.
    logger.info("upload.imgbb.skipped reason=stub_mode")
    return None


def _save_locally(data: bytes, mime: str, original_name: str) -> UploadResult:
    """Persiste local en UPLOAD_LOCAL_DIR. Devuelve URL relativa /uploads/<id>."""
    base = _ensure_upload_dir()
    ext = _ext_from_mime(mime)
    file_id = secrets.token_urlsafe(16)
    safe_original = sanitize_filename(original_name, max_length=80)
    target = base / f"{file_id}{ext}"

    try:
        target.write_bytes(data)
    except OSError as exc:
        logger.error(
            "upload.local.fail filename=%s err=%s",
            safe_original,
            type(exc).__name__,
        )
        raise UploadError("Failed to persist file locally") from None

    public_url = f"/uploads/{file_id}{ext}"
    logger.info(
        "upload.local.ok original=%s stored=%s size=%s mime=%s",
        safe_original,
        target.name,
        len(data),
        mime,
    )
    return UploadResult(
        url=public_url,
        filename=safe_original,
        mime_type=mime,
        size_bytes=len(data),
        backend="local",
    )


# ─── API pública ───────────────────────────────────────────────────────────


async def upload_image(
    file: UploadFile,
    *,
    owner_id: UUID,
    kind: str,
    max_size: int,
    allowed_mime: set[str],
) -> UploadResult:
    """Sube una imagen. Intenta ImgBB primero (R6), cae a local si falla."""
    if not file.filename:
        raise UploadError("Empty filename")
    if not file.content_type or file.content_type not in allowed_mime:
        raise UploadError("Invalid content type")

    data = await _read_with_size_check(file, max_size)
    if not data:
        raise UploadError("Empty file")

    detected = _detect_mime_from_bytes(data)
    if detected is None or detected != file.content_type:
        # Magic bytes no concuerdan con content_type → bloqueamos.
        # Defensa contra renamed-extension exploits.
        logger.warning(
            "upload.mime_mismatch owner_id=%s declared=%s detected=%s",
            owner_id,
            file.content_type,
            detected,
        )
        raise UploadError("File content does not match declared type")

    # 1) Intento ImgBB (stub hoy).
    imgbb = await _upload_to_imgbb(data, file.filename, detected)
    if imgbb is not None:
        return imgbb

    # 2) Fallback local (R6).
    result = _save_locally(data, detected, file.filename)
    logger.info(
        "upload.image.ok owner_id=%s kind=%s backend=%s",
        owner_id,
        kind,
        result.backend,
    )
    return result


async def upload_rif_document(
    file: UploadFile,
    *,
    owner_id: UUID,
    max_size: int,
    allowed_mime: set[str],
) -> UploadResult:
    """Sube documento RIF (imagen o PDF). Mismo flujo que upload_image
    pero acepta `application/pdf`. Hoy SOLO usa local (PDFs no van a ImgBB).
    """
    if not file.filename:
        raise UploadError("Empty filename")
    if not file.content_type or file.content_type not in allowed_mime:
        raise UploadError("Invalid content type")

    data = await _read_with_size_check(file, max_size)
    if not data:
        raise UploadError("Empty file")

    detected = _detect_mime_from_bytes(data)
    if detected is None or detected != file.content_type:
        raise UploadError("File content does not match declared type")

    # Imágenes podrían ir a ImgBB, PDFs sólo local.
    if detected.startswith("image/"):
        imgbb = await _upload_to_imgbb(data, file.filename, detected)
        if imgbb is not None:
            return imgbb

    result = _save_locally(data, detected, file.filename)
    logger.info(
        "upload.rif.ok owner_id=%s backend=%s",
        owner_id,
        result.backend,
    )
    return result


# ─── Bootstrap helper para servir /uploads desde FastAPI ────────────────────


def get_uploads_dir() -> str:
    """Asegura el dir y retorna el path absoluto. Usar al montar StaticFiles."""
    return str(_ensure_upload_dir())
