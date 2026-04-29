"""Configuración de logging estructurado.

Spec: Orquestor.md R13 — eventos de auth, cambios de estado y acceso a
recursos sensibles deben quedar loggeados con contexto.

Formato actual: texto plano con prefijo del logger. Si llegamos a producción
necesitando JSON estructurado, sustituir el formatter por uno tipo
`python-json-logger` sin tocar los call-sites.
"""

from __future__ import annotations

import logging
import sys

from app.core.config import settings


def configure_logging() -> None:
    root = logging.getLogger()
    if root.handlers:  # idempotente — Uvicorn reload puede invocarnos varias veces
        return
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s :: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(settings.LOG_LEVEL)

    # Silenciar ruido de librerías
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
