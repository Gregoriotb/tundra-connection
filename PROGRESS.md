# Tundra Connection — Progreso de Implementación

> Documento vivo. Se actualiza al cerrar cada fase del [Orquestor.md](SDD/Orquestor.md).

**Inicio:** 2026-04-27
**Fase actual:** FASE 5 — WebSocket + Notificaciones (pendiente de iniciar)

---

## Resumen de Fases

| # | Fase | Estado | Cierre |
|---|------|--------|--------|
| 1 | Fundación y Auth | 🟢 COMPLETA | 2026-04-27 |
| 2 | Catálogo Mínimo + Carrito | 🟢 COMPLETA | 2026-04-27 |
| 3 | Servicios con Overlays | 🟢 COMPLETA | 2026-04-27 |
| 4 | Chat-Cotizaciones | 🟢 COMPLETA | 2026-04-27 |
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

## CHECKPOINT: TUNDRA-FASE-3-SERVICIOS

- **Estado:** COMPLETO
- **Fecha:** 2026-04-27
- **Branch:** `feature/fase-3-servicios-overlays`

### Archivos creados (11 principales + 8 auxiliares de scaffold)

**Backend:**
- [`backend/app/models/service.py`](backend/app/models/service.py) — Modelo Service con planes JSONB + helper `find_plan()`
- [`backend/app/models/invoice.py`](backend/app/models/invoice.py) — Modelo Invoice (R15: `extra_data` ↔ columna SQL `metadata`)
- [`backend/app/schemas/service.py`](backend/app/schemas/service.py) — `InternetPlan`, `ServiceOut`, `ServiceListOut`
- [`backend/app/schemas/invoice.py`](backend/app/schemas/invoice.py) — `CheckoutIn` discriminated union, `InvoiceOut`
- [`backend/app/api/v1/services.py`](backend/app/api/v1/services.py) — `GET /services`, `GET /services/{slug}`
- [`backend/app/api/v1/invoices.py`](backend/app/api/v1/invoices.py) — `POST /checkout` (PRODUCT_SALE+INTERNET), `my-invoices`, `{id}` con IDOR
- [`backend/alembic/versions/0003_services_invoices.py`](backend/alembic/versions/0003_services_invoices.py) — migración
- [`backend/alembic/versions/0004_seed_services.py`](backend/alembic/versions/0004_seed_services.py) — seed idempotente de 3 servicios

**Frontend principal (FASE 3):**
- [`frontend/src/components/ServiceCard.tsx`](frontend/src/components/ServiceCard.tsx) — Card prestige con icon, hover lift+glow
- [`frontend/src/components/ServiceOverlay.tsx`](frontend/src/components/ServiceOverlay.tsx) — Framer Motion fade+scale 400ms, stagger 100ms
- [`frontend/src/components/InternetPlanModal.tsx`](frontend/src/components/InternetPlanModal.tsx) — Submit del checkout con auth gate

**Frontend scaffold (bonus, sin él el código no compilaba):**
- [`frontend/package.json`](frontend/package.json) — react/vite/tailwind/framer-motion/lucide/axios
- [`frontend/tsconfig.json`](frontend/tsconfig.json) — strict, sin `@/` aliases
- [`frontend/vite.config.ts`](frontend/vite.config.ts)
- [`frontend/tailwind.config.js`](frontend/tailwind.config.js) — paleta `tundra.*` exacta del spec
- [`frontend/postcss.config.js`](frontend/postcss.config.js)
- [`frontend/index.html`](frontend/index.html) — fonts del spec (Archivo Black + Outfit)
- [`frontend/src/main.tsx`](frontend/src/main.tsx) + [`frontend/src/index.css`](frontend/src/index.css)
- [`frontend/src/App.tsx`](frontend/src/App.tsx) — providers + landing minimal
- [`frontend/src/sections/ServicesSection.tsx`](frontend/src/sections/ServicesSection.tsx) — orquesta cards + overlay + modal

### Decisiones especiales

- **Discriminated union en `/invoices/checkout`** — un solo endpoint, dos shapes (`PRODUCT_SALE` / `INTERNET_SERVICE`) discriminados por `tipo`. Pydantic v2 hace el routing.
- **Re-validación TOTAL server-side** — el endpoint NO confía en `unit_price` del cart ni en `precio_mensual` que mande el cliente; recalcula contra BD (anti-patrón #5).
- **Lock pesimista** (`SELECT ... FOR UPDATE`) en checkout PRODUCT_SALE para evitar sobre-venta de stock en concurrencia.
- **R15 `metadata` resuelto** — atributo Python `extra_data`, columna SQL `metadata` (`mapped_column("metadata", ...)`).
- **IDOR en `/invoices/{id}`** retorna 404 (no 403) para no leak de existencia.
- **Seed idempotente** con `ON CONFLICT (slug) DO NOTHING` — re-ejecutable sin duplicar.
- **Ediciones admin de servicios** quedan para FASE 8 (panel admin completo).

### Tests pasados (manual)
- [ ] `alembic upgrade head` aplica `0003` y `0004` sin errores.
- [ ] `GET /services` lista los 3 servicios ordenados por `display_order`.
- [ ] `POST /invoices/checkout` con tipo=PRODUCT_SALE → resta stock + crea invoice.
- [ ] Stock 0 en uno de los items → 409 con mensaje claro.
- [ ] `POST /invoices/checkout` con tipo=INTERNET_SERVICE → invoice con `plan_seleccionado` JSONB.
- [ ] Mismo endpoint con `plan_id` inexistente → 400.
- [ ] `GET /invoices/{id}` con un invoice_id ajeno → 404 (no 403).
- [ ] Frontend: `cd frontend && npm install && npm run dev` → landing carga las 3 cards animadas.
- [ ] Click en ServiceCard → overlay con planes; click en plan → modal de instalación; submit → invoice creada.

### Reglas aplicadas (sumadas a fases previas)
| Regla | Dónde |
|-------|-------|
| R4 IDOR | `GET /invoices/{id}` con check ownership-or-admin → 404 si falla |
| R9 Anti #5 | Precios re-calculados desde BD en checkout |
| R15 metadata | `Invoice.extra_data` mapeado a columna SQL `metadata` |

### Pendientes / TODO
- **Smoke test integral** — requiere Docker daemon activo + `npm install` en frontend.
- **Logo real** — actualmente texto "TUNDRA.connection" en el header de App.tsx.
- **Hero / Header completos** — el spec de UI tiene un Hero animado; en App.tsx hoy hay solo header básico.
- **`/auth/password`** endpoint — referenciado en `authApi` pero el handler backend no existe aún.
- **Ediciones admin de servicios** — FASE 8.

### Siguiente fase
**FASE 4 — Chat-Cotizaciones.** Modelos `QuotationThread` + `ChatMessage`, endpoints, UI de chat (con polling primero, WebSocket en FASE 5). Conecta el botón "Iniciar cotización" del overlay de Servicios Extras.

---

## CHECKPOINT: TUNDRA-FASE-4-CHAT

- **Estado:** COMPLETO
- **Fecha:** 2026-04-27
- **Branch:** `feature/fase-4-chat-cotizaciones`

### Archivos creados (8 principales + extensión api.ts)

**Backend:**
- [`backend/app/models/quotation_thread.py`](backend/app/models/quotation_thread.py) — Modelo con CASCADE/SET NULL FKs, helper estados
- [`backend/app/models/chat_message.py`](backend/app/models/chat_message.py) — Modelo con CHECK content no-vacío, índice compuesto
- [`backend/app/schemas/chat.py`](backend/app/schemas/chat.py) — Inputs (text-only para clientes), Outputs con `last_message_preview`/`unread_count`
- [`backend/app/api/v1/chat_quotations.py`](backend/app/api/v1/chat_quotations.py) — 7 endpoints (5 cliente + 2 admin), regla "solo servicios_extras", IDOR centralizado
- [`backend/alembic/versions/0005_quotations_chat.py`](backend/alembic/versions/0005_quotations_chat.py) — migración con índice compuesto `(thread_id, created_at)`

**Frontend:**
- [`frontend/src/components/ChatMessage.tsx`](frontend/src/components/ChatMessage.tsx) — 3 estilos (system/text/attachment), Avatar con iniciales, badge SOPORTE
- [`frontend/src/components/ChatThread.tsx`](frontend/src/components/ChatThread.tsx) — Polling 5s con diff, append optimista, atajos teclado, estados terminales
- [`frontend/src/pages/QuotationsPage.tsx`](frontend/src/pages/QuotationsPage.tsx) — Sidebar + chat, responsive, polling 15s para sidebar

**Modificados:**
- `backend/app/main.py` — montaje de `/chat-quotations` y `/admin/threads`
- `backend/app/models/__init__.py` — registra `QuotationThread`, `ChatMessage`
- `frontend/src/services/api.ts` — `chatApi` con `createThread`, `myThreads`, `getThread`, `postMessage`

### Decisiones especiales

- **Chat solo para `service.slug='servicios_extras'`** — validado server-side; intentos con fibra/satelital → 400.
- **Cliente no puede crear `system` ni `attachment` directamente** — `MessageCreateIn.message_type: Literal["text"]` cierra superficie de ataque.
- **Mensaje inicial automático** — al crear un thread, el `requerimiento_inicial` se inserta también como primer ChatMessage (el admin ve el contexto en el timeline).
- **System messages para cambios de estado** — admin cambia status → row en `chat_messages` con `message_type='system'`. Sin tabla aparte de eventos.
- **`unread_count` heurístico** — cuenta mensajes con `user_id != viewer_id`. Read-receipts reales (tabla aparte) no están en el spec.
- **Polling 5s en chat / 15s en sidebar** — deuda explícita con fecha de muerte: FASE 5 reemplaza con WS push. El refactor es mínimo gracias al diff en `setDetail`.
- **Estados terminales (`closed`/`cancelled`) bloquean POST** — 409 server-side + input deshabilitado client-side.

### Tests pasados (manual)
- [ ] `alembic upgrade head` aplica `0005`.
- [ ] `POST /chat-quotations/threads` con `service_id` de fibra → 400 "only available for servicios_extras".
- [ ] `POST /chat-quotations/threads` con `servicios_extras` → 201 + mensaje inicial creado.
- [ ] `POST /messages` con `message_type="system"` → 422 (Pydantic forbid).
- [ ] `GET /threads/{id_ajeno}` → 404 (no 403, no leak).
- [ ] `PATCH /admin/threads/{id}/status` → cambia estado + inserta system message en timeline.
- [ ] Frontend: abrir QuotationsPage, click en thread, enviar mensaje → aparece optimista; polling lo confirma.
- [ ] Cerrar el thread como admin → input se deshabilita client-side; enviar via curl → 409.

### Reglas aplicadas (sumadas)
| Regla | Dónde |
|-------|-------|
| R4 IDOR | `_get_thread_or_404` 404 sobre ajeno |
| R5 ORM | `select(...)` en todos los handlers |
| R9 Surface | `MessageCreateIn` solo `text`; bound `MAX_ATTACHMENTS_PER_MESSAGE=5` |
| R13 | log WARNING en cambios de estado y intentos IDOR |
| R14 | exactamente los 7 endpoints del spec |

### Pendientes / TODO
- **Sanitización HTML del content** — utils/sanitize.py llega en FASE 5 (cuando los mensajes crucen WS sin re-encode del navegador).
- **Adjuntos reales (ImgBB)** — endpoint `/attachments` es stub; FASE 7 lo reemplaza con `UploadFile` + ImgBB + fallback local (R6).
- **Read receipts reales** — el `unread_count` actual es heurístico; un sistema completo requiere tabla `message_reads` (pendiente de propuesta admin).

### Siguiente fase
**FASE 5 — WebSocket + Notificaciones.** `SecureWSManager`, `WebSocketContext`, `NotificationBell`, modelo `Notification`. Reemplaza polling de chat y sidebar por push en tiempo real.

---

## Bitácora

- **2026-04-27** — Inicio FASE 1. Memoria + `PROGRESS.md` creados. Repo público en GitHub: <https://github.com/Gregoriotb/tundra-connection>. Branches `main` (protegida), `develop`, `feature/fase-1-fundacion-auth`.
- **2026-04-27** — FASE 1 completa: 12 archivos principales + 6 auxiliares. Decisión clave: bootstrap admin via identifier literal `"admin"`. PR #1 abierto.
- **2026-04-27** — FASE 2 completa: catálogo público + admin CRUD, CartContext con aritmética entera, CatalogSection con 4 estados. Logo placeholder pendiente de reemplazo cuando el cliente lo provea.
- **2026-04-27** — FASE 3 completa: modelos `Service` + `Invoice`, endpoints `/services`, `/invoices/checkout` con discriminated union (PRODUCT_SALE + INTERNET_SERVICE) y lock pesimista de stock, seed de los 3 servicios con planes, `ServiceCard` + `ServiceOverlay` (Framer Motion stagger) + `InternetPlanModal`. Bonus: scaffold del frontend (package.json, vite, tsconfig, tailwind), `App.tsx`, `ServicesSection.tsx`. Pendiente: smoke test + `npm install`.
- **2026-04-27** — FASE 4 completa: modelos `QuotationThread` + `ChatMessage`, endpoints `/chat-quotations` (cliente) + `/admin/threads` (admin), `ChatMessage` (3 estilos), `ChatThread` con polling 5s + append optimista, `QuotationsPage` 2-col responsive. Polling marcado como deuda explícita — swap a WebSocket en FASE 5 con refactor mínimo (`setDetail` es punto único de mutación).
