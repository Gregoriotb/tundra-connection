# Tundra Connection — Backend image (FASE 11 production-ready)
#
# Multi-stage build:
#   - builder: instala dependencias Python (incluye build-essential)
#   - runtime: copia solo las wheels + libs runtime, corre como non-root
#
# Migraciones: el contenedor ejecuta `alembic upgrade head` antes de
# levantar uvicorn. Si falla, el contenedor crashea — Railway hará retry
# y la falla queda visible en logs.

# ─── Stage 1: builder ────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip wheel --wheel-dir /wheels -r requirements.txt


# ─── Stage 2: runtime ────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

# Solo libs runtime — no compiler.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 tundra

COPY --from=builder /wheels /wheels
COPY requirements.txt ./
RUN pip install --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

COPY --chown=tundra:tundra . .

# Carpeta de uploads escribible por el user de la app.
RUN mkdir -p /app/uploads && chown -R tundra:tundra /app/uploads

USER tundra

EXPOSE 8000

# Railway/Vercel inyectan $PORT en runtime. Healthcheck profundo en /healthz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/healthz" || exit 1

# Alembic upgrade head antes de uvicorn — idempotente.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
