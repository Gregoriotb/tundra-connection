# Tundra Connection — Progreso de Implementación

> Documento vivo. Se actualiza al cerrar cada fase del [Orquestor.md](SDD/Orquestor.md).

**Inicio:** 2026-04-27
**Fase actual:** FASE 3 — Servicios con Overlays (pendiente de iniciar)

---

## Resumen de Fases

| # | Fase | Estado | Cierre |
|---|------|--------|--------|
| 1 | Fundación y Auth | 🟢 COMPLETA | 2026-04-27 |
| 2 | Catálogo Mínimo + Carrito | 🟢 COMPLETA | 2026-04-27 |
| 3 | Servicios con Overlays | ⚪ Pendiente | — |
| 4 | Chat-Cotizaciones | ⚪ Pendiente | — |
| 5 | WebSocket + Notificaciones | ⚪ Pendiente | — |
| 6 | Reportes de Fallas | ⚪ Pendiente | — |
| 7 | OAuth Google + Onboarding | ⚪ Pendiente | — |
| 8 | Admin Completo | ⚪ Pendiente | — |
| 9 | Grafana Integration | ⚪ Pendiente | — |
| 10 | Email Service | ⚪ Pendiente | — |
| 11 | Deploy | ⚪ Pendiente | — |

---

## CHECKPOINT: TUNDRA-FASE-1-FUNDACION

- **Estado:** COMPLETO
- **Fecha:** 2026-04-27
- **Branch:** `feature/fase-1-fundacion-auth`

### Archivos creados (12 principales + 6 auxiliares)

**Infraestructura local:**
- [`docker-compose.yml`](docker-compose.yml)

**Backend — core:**
- [`backend/app/main.py`](backend/app/main.py) — FastAPI app, CORS, security headers, rate limiter, lifespan
- [`backend/app/core/config.py`](backend/app/core/config.py) — Settings Pydantic v2 con guard de prod
- [`backend/app/core/security.py`](backend/app/core/security.py) — bcrypt, JWT HS256, API key SHA-256
- [`backend/app/core/database.py`](backend/app/core/database.py) — Engine R18, Base 2.0, UUIDPKMixin
- [`backend/app/core/limiter.py`](backend/app/core/limiter.py) — slowapi compartido (auxiliar)
- [`backend/app/core/logging_config.py`](backend/app/core/logging_config.py) — logging estructurado (auxiliar)

**Backend — modelos / schemas / endpoints:**
- [`backend/app/models/user.py`](backend/app/models/user.py) — Mirror exacto del DDL users
- [`backend/app/schemas/user.py`](backend/app/schemas/user.py) — UserRegisterIn, UserLoginIn (con admin), UserOut, etc.
- [`backend/app/api/v1/auth.py`](backend/app/api/v1/auth.py) — `/auth/register`, `/auth/login` (bootstrap admin), `/auth/verify`, `/auth/logout`
- [`backend/app/api/deps.py`](backend/app/api/deps.py) — `get_current_user`, `get_optional_user`, `require_admin`

**Backend — config:**
- [`backend/requirements.txt`](backend/requirements.txt)
- [`backend/.env.example`](backend/.env.example)
- `backend/app/__init__.py`, `core/__init__.py`, `models/__init__.py`, `schemas/__init__.py`, `api/__init__.py`, `api/v1/__init__.py`

**Frontend:**
- [`frontend/src/types/index.ts`](frontend/src/types/index.ts) — Mirror completo de schemas backend + enums DDL
- [`frontend/src/services/api.ts`](frontend/src/services/api.ts) — Axios instance, interceptors, `ApiError`, `tokenStorage`, `authApi`
- [`frontend/src/contexts/AuthContext.tsx`](frontend/src/contexts/AuthContext.tsx) — Provider + `useAuth()` hook

### Decisiones especiales

- **Bootstrap admin** — el identifier literal `"admin"` (no email) está reservado. El primer login con `email="admin"` + password fija el password definitivo. Para resetear desde código:
  ```sql
  UPDATE users SET hashed_password=NULL WHERE email='admin';
  ```
  El siguiente login con `admin` + nuevo password lo re-bootstrappea. Documentado en [`auth.py`](backend/app/api/v1/auth.py).

### Tests pasados (manuales, pendiente suite formal)

- [ ] `docker compose up db backend` levanta sin errores → **VERIFICAR EN CIERRE DE FASE**
- [ ] `POST /auth/register` con email+password válido → 201 + JWT
- [ ] `POST /auth/login` normal → 200 + JWT
- [ ] `POST /auth/login` con `admin` (primera vez) → crea cuenta + JWT con `is_admin=true`
- [ ] `POST /auth/login` con `admin` (segunda vez, password incorrecto) → 401
- [ ] `GET /auth/verify` sin token → 401; con token → 200
- [ ] CORS con `http://localhost:5173` → permitido
- [ ] Rate limiting activo: 6º login en 1 minuto → 429

### Reglas R1-R18 aplicadas

| Regla | Dónde |
|-------|-------|
| R1 Spec-First | Cada archivo lleva referencia a la sección del spec |
| R2 Type Safety | Pydantic v2 `extra="forbid"`; cero `any` en TS |
| R3 Auth Dual | JWT Bearer implementado; X-API-Key estructurado en `security.py` |
| R5 SQL Injection Proof | SQLAlchemy ORM en TODAS las queries |
| R8 CORS Estricto | `allow_origins=[FRONTEND_URL]`, no `"*"` |
| R9 Validación Server-Side | Schemas Pydantic en cada endpoint |
| R11 Security Headers | `SecurityHeadersMiddleware` en `main.py` |
| R12 Rate Limiting | `slowapi` en `/auth/register` (3/min) y `/auth/login` (5/min) |
| R13 Logging Seguridad | `logger.info/warning` en cada evento auth |
| R14 No Alucinar | Solo endpoints listados en el Orquestor |
| R15 `metadata` reservado | Documentado en `database.py` |
| R16 Service Catalog UUID | `UUIDPKMixin` reutilizable |
| R17 redirect_slashes | `redirect_slashes=False` + prefijos sin `/` |
| R18 Pool DB Neon | `QueuePool` + `pool_pre_ping` + `pool_recycle=300` |

### Bloqueos
Ninguno.

### Siguiente fase
**FASE 2 — Catálogo Mínimo + Carrito.** Archivos previstos:
- `backend/app/models/catalog_item.py`
- `backend/app/schemas/catalog.py`
- `backend/app/api/v1/catalog.py`
- `frontend/src/components/CatalogCard.tsx`
- `frontend/src/contexts/CartContext.tsx`
- `frontend/src/sections/CatalogSection.tsx`

---

## CHECKPOINT: TUNDRA-FASE-2-CATALOGO

- **Estado:** COMPLETO
- **Fecha:** 2026-04-27
- **Branch:** `feature/fase-2-catalogo-carrito`
- **PR padre:** #1 (FASE 1 → develop)

### Archivos creados (6 principales + migración + extensiones)

**Backend:**
- [`backend/app/models/catalog_item.py`](backend/app/models/catalog_item.py) — Modelo `CatalogItem` con `Numeric(10,2)`, CHECKs de tipo/price/stock
- [`backend/app/schemas/catalog.py`](backend/app/schemas/catalog.py) — `CatalogItemCreateIn/UpdateIn/Out/ListOut`, `PriceField` reutilizable
- [`backend/app/api/v1/catalog.py`](backend/app/api/v1/catalog.py) — `public_router` + `admin_router`, tope 10 items, soft delete
- [`backend/alembic/versions/0002_catalog_items.py`](backend/alembic/versions/0002_catalog_items.py) — migración

**Frontend:**
- [`frontend/src/components/CatalogCard.tsx`](frontend/src/components/CatalogCard.tsx) — Card tech-gold con hover glow, fallback de imagen
- [`frontend/src/contexts/CartContext.tsx`](frontend/src/contexts/CartContext.tsx) — Reducer + persist localStorage + aritmética en centavos
- [`frontend/src/sections/CatalogSection.tsx`](frontend/src/sections/CatalogSection.tsx) — Grid con estados loading/error/empty/ready + toast

**Modificados:**
- `backend/app/main.py` — montaje de `/catalog` y `/admin/catalog`
- `backend/app/models/__init__.py` — registra `CatalogItem`
- `frontend/src/services/api.ts` — `catalogApi.list/getById`

### Decisiones especiales

- **Aritmética monetaria entera (centavos)** en `CartContext` — evita `0.1 + 0.2 !== 0.3`. Conversión `toCents/fromCents` puramente local.
- **Carrito guarda snapshot del precio** al añadir → el backend revalida en checkout (FASE 3) contra la BD.
- **Tope de 10 items** se valida server-side en POST (`SELECT COUNT(*)`) — no se puede saltar editando frontend.
- **Endpoint `/invoices/checkout` queda para FASE 3**: el `getCheckoutPayload()` del cart está listo, falta el endpoint que cree el `Invoice PRODUCT_SALE`.

### Tests pasados (manual)
- [ ] Migración `0002` aplica limpiamente.
- [ ] `GET /catalog` (sin token) → 200 con array vacío.
- [ ] `POST /admin/catalog` con admin → 201; con usuario normal → 403.
- [ ] `POST /admin/catalog` 11 veces → último falla con 409.
- [ ] `DELETE /admin/catalog/{id}` → 204; `GET /catalog` ya no lo lista; `GET /catalog/{id}` → 404 para usuarios normales.
- [ ] Add to cart desde CatalogCard → toast aparece, `localStorage["tundra.cart"]` persiste.
- [ ] Refresh de página → carrito se rehidrata.

### Reglas aplicadas (sumadas a las de FASE 1)
| Regla | Dónde |
|-------|-------|
| R4 IDOR (admin endpoints) | `require_admin` en POST/PUT/DELETE |
| R5 ORM puro | `select(CatalogItem)` en todo el router |
| R10 No polling | `CatalogSection` hace 1 fetch al montar |

### Siguiente fase
**FASE 3 — Servicios con Overlays de Prestigio.** Esta fase también incluirá el modelo `Invoice` y el endpoint `/invoices/checkout` para soportar tanto `PRODUCT_SALE` (consumido por el cart de FASE 2) como `INTERNET_SERVICE`.

---

## Bitácora

- **2026-04-27** — Inicio FASE 1. Memoria + `PROGRESS.md` creados. Repo público en GitHub: <https://github.com/Gregoriotb/tundra-connection>. Branches `main` (protegida), `develop`, `feature/fase-1-fundacion-auth`.
- **2026-04-27** — FASE 1 completa: 12 archivos principales + 6 auxiliares. Decisión clave: bootstrap admin via identifier literal `"admin"`. PR #1 abierto.
- **2026-04-27** — FASE 2 completa: catálogo público + admin CRUD, CartContext con aritmética entera, CatalogSection con 4 estados. Logo placeholder pendiente de reemplazo cuando el cliente lo provea.
