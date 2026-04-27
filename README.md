# Tundra Connection

Plataforma web **B2B/B2C** para una empresa de telecomunicaciones venezolana. Construida con **Spec-Driven Development (SDD)** — el spec es la ley.

> Servicios: Internet Fibra Óptica · Internet Satelital · Servicios Técnicos Extras · Reportes de Fallas · Monitoreo Grafana

---

## Stack

| Capa | Tecnología | Hosting |
|------|------------|---------|
| Frontend | React 18 + Vite 5 + TypeScript 5 (strict) + Tailwind 3 | Vercel |
| Backend | Python 3.11 + FastAPI 0.110 + SQLAlchemy 2 + Pydantic v2 + Alembic | Railway |
| Database | PostgreSQL 16 serverless | Neon |
| Auth | JWT Bearer + bcrypt + Google OAuth 2.0 + X-API-Key (SHA-256) | — |
| Realtime | WebSocket nativo FastAPI | — |
| Email | Resend API | — |
| Uploads | ImgBB API + fallback local | — |
| Monitoreo | Grafana API (embed + proxy) | Grafana Cloud |

## Documentación

Toda la especificación vive en [`SDD/`](SDD/):

- [`Orquestor.md`](SDD/Orquestor.md) — Prompt orquestador, reglas R1–R18, fases.
- [`MASTER_CONTEXT.md`](SDD/MASTER_CONTEXT.md) — Visión y alcance.
- [`ARCHITECTURE.md`](SDD/ARCHITECTURE.md) — Stack y estructura.
- [`DATABASE_SCHEMA.md`](SDD/DATABASE_SCHEMA.md) — Tablas, tipos, constraints.
- [`API_SPECIFICATION.md`](SDD/API_SPECIFICATION.md) — Endpoints.
- [`UI_UX_SPEC.md`](SDD/UI_UX_SPEC.md) — Diseño tech-gold luxury.
- [`SECURITY_RULES.md`](SDD/SECURITY_RULES.md) — Vulnerabilidades, headers, checklist.
- [`PROGRESS.md`](PROGRESS.md) — Estado vivo de las 11 fases.

## Estado de Implementación

| # | Fase | Estado |
|---|------|--------|
| 1 | Fundación y Auth | 🟡 En progreso |
| 2 | Catálogo + Carrito | ⚪ Pendiente |
| 3 | Servicios + Overlays | ⚪ Pendiente |
| 4 | Chat-Cotizaciones | ⚪ Pendiente |
| 5 | WebSocket + Notificaciones | ⚪ Pendiente |
| 6 | Reportes de Fallas | ⚪ Pendiente |
| 7 | OAuth Google + Onboarding | ⚪ Pendiente |
| 8 | Admin Completo | ⚪ Pendiente |
| 9 | Grafana Integration | ⚪ Pendiente |
| 10 | Email Service | ⚪ Pendiente |
| 11 | Deploy | ⚪ Pendiente |

Detalle en [`PROGRESS.md`](PROGRESS.md).

## Branching

- `main` — estable, mergeable solo vía PR desde `develop`.
- `develop` — integración continua.
- `feature/fase-N-<slug>` — branch por fase del Orquestor.

## Quick Start (dev local)

```bash
# Clonar
git clone https://github.com/Gregoriotb/tundra-connection.git
cd tundra-connection

# Variables de entorno
cp SDD/plantilla\ de\ variables\ de\ entorno.md .env  # ajustar valores

# Levantar stack
docker compose up db backend
```

Backend: <http://localhost:8000> · Docs OpenAPI: <http://localhost:8000/docs>

---

**Autor:** [@Gregoriotb](https://github.com/Gregoriotb) — Proyecto de portafolio.
