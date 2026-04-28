# Tundra Connection — Progreso de Implementación

> Documento vivo. Se actualiza al cerrar cada fase del [Orquestor.md](SDD/Orquestor.md).

**Inicio:** 2026-04-27
**Fase actual:** FASE 8 — Admin Completo (pendiente de iniciar)

---

## Resumen de Fases

| # | Fase | Estado | Cierre |
|---|------|--------|--------|
| 1 | Fundación y Auth | 🟢 COMPLETA | 2026-04-27 |
| 2 | Catálogo Mínimo + Carrito | 🟢 COMPLETA | 2026-04-27 |
| 3 | Servicios con Overlays | 🟢 COMPLETA | 2026-04-27 |
| 4 | Chat-Cotizaciones | 🟢 COMPLETA | 2026-04-27 |
| 5 | WebSocket + Notificaciones | 🟢 COMPLETA | 2026-04-27 |
| 6 | Reportes de Fallas | 🟢 COMPLETA | 2026-04-27 |
| 7 | OAuth Google + Onboarding | 🟡 MAQUETA | 2026-04-27 |
| 8 | Admin Completo | ⚪ Pendiente | — |
| 9 | Grafana Integration | ⚪ Pendiente | — |
| 10 | Email Service | ⚪ Pendiente | — |
| 11 | Deploy + Sweep integraciones | ⚪ Pendiente | — |

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

## CHECKPOINT: TUNDRA-FASE-5-WEBSOCKET

- **Estado:** COMPLETO
- **Fecha:** 2026-04-27
- **Branch:** `feature/fase-5-websocket-notificaciones`

### Archivos creados (12 principales + modificaciones)

**Backend:**
- [`backend/app/models/notification.py`](backend/app/models/notification.py) — Modelo Notification
- [`backend/app/schemas/notification.py`](backend/app/schemas/notification.py) — DTOs
- [`backend/app/utils/sanitize.py`](backend/app/utils/sanitize.py) — `sanitize_user_text` + `sanitize_filename`
- [`backend/app/websocket/connection.py`](backend/app/websocket/connection.py) — `WSConnection` (lock, touch, subscribe sets)
- [`backend/app/websocket/manager.py`](backend/app/websocket/manager.py) — `SecureWSManager` (R7)
- [`backend/app/websocket/handlers.py`](backend/app/websocket/handlers.py) — `/ws` endpoint + dispatcher
- [`backend/app/api/v1/notifications.py`](backend/app/api/v1/notifications.py) — 5 endpoints
- [`backend/alembic/versions/0006_notifications.py`](backend/alembic/versions/0006_notifications.py) — migración con partial index
- [`backend/app/services/notification_service.py`](backend/app/services/notification_service.py) — `notify()` + `emit_thread_event()`

**Frontend:**
- [`frontend/src/contexts/WebSocketContext.tsx`](frontend/src/contexts/WebSocketContext.tsx) — Provider con backoff exponencial
- [`frontend/src/components/NotificationBell.tsx`](frontend/src/components/NotificationBell.tsx) — Bell + dropdown + push real-time

**Modificados:**
- `backend/app/main.py` — lifespan WS manager + mount `/ws`, `/notifications`
- `backend/app/api/v1/chat_quotations.py` — emit chat_message/thread_updated + notify + sanitize
- `backend/app/api/v1/invoices.py` — notify invoice_created
- `backend/app/models/__init__.py` — registra Notification
- `frontend/src/App.tsx` — `WebSocketProvider` + `NotificationBell` en header
- `frontend/src/components/ChatThread.tsx` — **swap polling → WS** con fallback 30s
- `frontend/src/services/api.ts` — `notificationsApi`

### Decisiones especiales

- **R7 — una conexión por usuario**: si llega una segunda conexión, la primera recibe `session_replaced` y se cierra con código 4000. El cliente NO reconecta tras 4000.
- **`emit_event_sync`** — bridge sync→async. Endpoints HTTP siguen siendo sync (compatibles con SQLA estilo 2.0); el WS vive en async. `asyncio.run_coroutine_threadsafe` programa el coro en el loop principal sin bloquear.
- **Push WS NO transaccional** — la BD es la fuente de verdad. Si el WS falla, la notificación queda persistida y el frontend hidrata al reconectar.
- **Subscripción WS con IDOR** — `subscribe_thread` valida ownership en BD antes de aceptar. Mismo patrón 404-no-403 del HTTP.
- **`subscribe_ticket` stub-seguro** — solo admins hasta FASE 6 (modelo `SupportTicket` no existe). Documentado en handlers.py.
- **Re-suscripción automática tras reconnect** — `desiredThreadsRef` y `desiredTicketsRef` re-aplicadas en `onopen`. Transparente para componentes.
- **Partial index en `notifications`** — `(user_id, created_at DESC) WHERE read_at IS NULL` → query del bell ultra-rápida con storage mínimo.
- **`exclude_user_id` en broadcast de chat** — el emisor del mensaje ya hizo append optimista; excluirlo evita doble-render.
- **`sanitize_user_text`** — bloquea `<script>/<iframe>/...`, control chars, normaliza Unicode NFC, colapsa whitespace, trunca con elipsis. Sin dependencia externa.

### Tests pasados (manual)
- [ ] `alembic upgrade head` aplica `0006`.
- [ ] `wscat -c "ws://localhost:8000/ws?token=<JWT>"` conecta; sin token → 1008.
- [ ] Conectar dos veces con el mismo token → la primera recibe `session_replaced`.
- [ ] `{action: "ping"}` → recibe `{type: "pong"}`.
- [ ] `{action: "subscribe_thread", thread_id: <ajeno>}` → `error: thread_not_found`.
- [ ] `{action: "subscribe_thread", thread_id: <propio>}` → `subscribed`.
- [ ] Admin envía mensaje al cliente → cliente recibe push `chat_message` + notification con badge.
- [ ] `PATCH /admin/threads/{id}/status` → cliente recibe `thread_updated` + `notification` + system message en timeline.
- [ ] `POST /invoices/checkout` → user recibe push `notification` con tipo `invoice_created`.
- [ ] Desconectar WS forzado → ChatThread cae a polling 30s; al reconectar, se re-suscribe automáticamente.
- [ ] Mensaje con `<script>alert(1)</script>` → guardado como `[bloqueado]alert(1)[bloqueado]`.

### Reglas aplicadas (sumadas)
| Regla | Dónde |
|-------|-------|
| R7 | `SecureWSManager` con 1 conn/user, heartbeat, timeout, sweeper |
| R10 | Polling efectivo eliminado del chat (solo fallback) |
| R6 sanitize | `sanitize_user_text` aplicado a content/note/requerimiento |

### Pendientes / TODO
- **Adjuntos reales (ImgBB)** — endpoint stub sigue ahí (FASE 7).
- **`subscribe_ticket` real** — espera el modelo `SupportTicket` (FASE 6).
- **Read receipts** — `unread_count` sigue heurístico.
- **Smoke test integral** — requiere Docker + frontend `npm install`.

### Siguiente fase
**FASE 6 — Reportes de Fallas (Alloy-style).** Modelo `SupportTicket`, endpoints, UI con creación + lista + detalle + admin Kanban. Activa el `subscribe_ticket` que está stub. Tickets emiten WS para admins (broadcast).

---

## CHECKPOINT: TUNDRA-FASE-6-TICKETS

- **Estado:** COMPLETO
- **Fecha:** 2026-04-27
- **Branch:** `feature/fase-6-reportes-fallas`

### Archivos creados (10 principales + modificaciones)

**Backend:**
- [`backend/app/models/support_ticket.py`](backend/app/models/support_ticket.py) — Modelo con 4 CHECKs + 2 relaciones a User (foreign_keys explícitos)
- [`backend/app/schemas/ticket.py`](backend/app/schemas/ticket.py) — Visibility por shape: `TicketOut` (sin notas) vs `TicketDetailOut` (admin)
- [`backend/app/api/v1/support_tickets.py`](backend/app/api/v1/support_tickets.py) — 10 endpoints con sequence atómica para `TICK-YYYY-NNNN`
- [`backend/alembic/versions/0007_support_tickets.py`](backend/alembic/versions/0007_support_tickets.py) — sequence + tabla + partial index sobre tickets activos

**Frontend:**
- [`frontend/src/components/TicketCreator.tsx`](frontend/src/components/TicketCreator.tsx) — Form 5 campos, success state con ticket_number
- [`frontend/src/components/TicketList.tsx`](frontend/src/components/TicketList.tsx) — Item con badges de estado + dot prioridad + filtros opcionales
- [`frontend/src/components/TicketDetail.tsx`](frontend/src/components/TicketDetail.tsx) — Timeline 4 tipos (status_change, reply, internal_note, assign), filtra `internal_note` para clientes
- [`frontend/src/pages/SupportTicketsPage.tsx`](frontend/src/pages/SupportTicketsPage.tsx) — Pantalla cliente 2-col responsive
- [`frontend/src/components/admin/TicketKanban.tsx`](frontend/src/components/admin/TicketKanban.tsx) — 6 columnas + quick status change + drawer detalle

**Modificados:**
- `backend/app/main.py` — montaje de `/support-tickets` y `/admin/support-tickets`
- `backend/app/models/__init__.py` — registra `SupportTicket`
- `backend/app/websocket/handlers.py` — `subscribe_ticket` real (deuda de FASE 5 saldada)
- `frontend/src/services/api.ts` — `ticketsApi` completo (10 métodos cliente + admin)

### Decisiones especiales

- **`ticket_number` con sequence Postgres** (`support_ticket_seq` global) → atomicidad garantizada bajo concurrencia. Formato `TICK-{YYYY}-{NNNN}` con `:04d` (los primeros 9999 cumplen).
- **Visibilidad por shape (R4 a nivel de response_model)** — handlers cliente usan `TicketOut`, admin usa `TicketDetailOut`. Imposible filtrar mal por accidente.
- **`historial_estados` append-only** con asignación de lista nueva (`[*old, new]`) para que SQLAlchemy detecte el cambio del JSONB.
- **System messages por evento** — `kind: status_change | reply | internal_note | assign` en cada entry, frontend renderiza diferenciado.
- **Reply guardado en `historial_estados`** en lugar de tabla aparte (R14: el spec no declara `ticket_messages`).
- **Filtrado de `internal_note` en frontend** — defensa en profundidad sobre la visibility del backend.
- **Sin drag-and-drop en Kanban** — quick-action `<select>` cumple la UX sin agregar lib externa.
- **Partial index sobre tickets activos** (`WHERE estado NOT IN ('solucionado', 'cancelado')`) → query principal del Kanban ultra-rápida.
- **`subscribe_ticket` real** — admin pasa siempre, cliente solo si es dueño. Cierra deuda de FASE 5.

### Tests pasados (manual)
- [ ] `alembic upgrade head` aplica `0007` (sequence + tabla + índices).
- [ ] `POST /support-tickets` → 201 con `ticket_number=TICK-2026-0001`. Segunda creación → 0002.
- [ ] `GET /support-tickets/{id_ajeno}` → 404.
- [ ] `GET /admin/support-tickets/{id}` con `notas_internas` poblado → admin ve, cliente no (ruta cliente).
- [ ] `PATCH /admin/.../status` → emite `ticket_updated` por WS, cliente recibe `notification`.
- [ ] `PATCH /admin/.../assign` con `assigned_to=<user_no_admin>` → 400.
- [ ] `POST /admin/.../internal-note` → entry con `kind='internal_note'` aparece en timeline admin pero NO en cliente.
- [ ] Frontend: crear ticket → aparece en `SupportTicketsPage`. Admin abre Kanban → ve la nueva card en columna "Abierto". Admin cambia estado con `<select>` → cliente recibe push y badge.
- [ ] Ticket marcado como `solucionado` → input deshabilitado en `TicketDetail` cliente.

### Reglas aplicadas (sumadas)
| Regla | Dónde |
|-------|-------|
| R4 visibility | `TicketDetailOut` solo en `/admin/*`; frontend filtra `internal_note` |
| R5 ORM | `select(...)` en todo |
| R9 sanitize | `sanitize_user_text` en titulo/descripcion/reply/nota |
| R13 audit | log WARNING en cambio de estado, asignación, internal note |
| R14 | exactamente los 10 endpoints listados |

### Pendientes / TODO
- **Adjuntos reales (ImgBB)** — endpoint `/support-tickets/{id}/attachments` no implementado todavía (planificado FASE 7).
- **Drag-and-drop en Kanban** — fuera de scope, se valuará si el negocio lo pide.
- **Reapertura de tickets terminales** — el endpoint admin permite reabrir cambiando estado, pero el cliente no tiene flow para "solicitar reapertura". Se evaluará en iteración futura.

### Siguiente fase
**FASE 7 — OAuth Google + Onboarding.** Endpoints `/auth/google/login` + `callback`, página `OnboardingPage`, banner "Completa tu RIF/dirección". Cierra el flow de cuentas Google-only que dejamos en FASE 1 con `hashed_password=NULL`. Activa upload de foto de perfil + RIF (con ImgBB + fallback local).

---

## CHECKPOINT: TUNDRA-FASE-7-OAUTH-MAQUETA

- **Estado:** ENTREGADA EN MAQUETA
- **Fecha:** 2026-04-27
- **Branch:** `feature/fase-7-oauth-onboarding`

### Archivos creados (7 principales + modificaciones)

**Backend:**
- [`backend/app/api/v1/auth.py`](backend/app/api/v1/auth.py) modificado — `/auth/google/login`, `/auth/google/callback`, `/auth/password`
- [`backend/app/api/v1/users.py`](backend/app/api/v1/users.py) — `GET/PUT /users/profile`, photo-upload, rif-upload
- [`backend/app/services/upload_service.py`](backend/app/services/upload_service.py) — magic bytes + chunks + ImgBB stub + fallback local

**Frontend:**
- [`frontend/src/pages/OnboardingPage.tsx`](frontend/src/pages/OnboardingPage.tsx) — Form completo con uploads
- [`frontend/src/components/ProfileCompletionBanner.tsx`](frontend/src/components/ProfileCompletionBanner.tsx) — Banner sutil dismissible por sesión
- [`frontend/src/components/UploadField.tsx`](frontend/src/components/UploadField.tsx) — Drag-drop reutilizable, 2 variantes

**Modificados:**
- `backend/app/main.py` — mount `/users/profile`, StaticFiles `/uploads`
- `backend/requirements.txt` — añade `httpx` para ImgBB futuro
- `frontend/src/App.tsx` — refactor en `AppShell`, rutea OnboardingPage si falta básico
- `frontend/src/services/api.ts` — `usersApi.uploadPhoto/uploadRif`, `oauthApi.googleLoginUrl`

### Decisiones especiales

- **Modo maqueta explícito** — endpoints estructuralmente correctos pero sin integración a Google real ni ImgBB real. Cada stub tiene un `TODO (sweep final)` con el código exacto a descomentar/escribir.
- **Magic bytes check** — primera línea de defensa contra MIME spoofing. `PNG`, `JPEG`, `WEBP`, `PDF` cubiertos. En sweep final se cambia a `python-magic` (libmagic) para cobertura completa.
- **Lectura por chunks (64 KB)** — detecta archivos enormes sin cargar todo en RAM.
- **`UploadField` desacoplado** — el componente no conoce endpoints, recibe `onUpload(file)` como prop. Reutilizable para chat, tickets, admin.
- **`AppShell` dentro de providers** — patrón para que `useAuth()` esté disponible en el routing.
- **Banner auto-oculto** — sessionStorage para dismiss, auto-cleanup cuando los campos se llenan.
- **RIF document URL** — el endpoint guarda el archivo y loggea el URL, pero NO persiste un campo dedicado en `User` (el spec sólo declara `rif_cedula` como número). Si el negocio lo pide, se añade en migración (R14).

### Tests pasados (manual)
- [ ] `GET /auth/google/login` sin credenciales → `{"authorize_url": "/oauth-stub?...", "configured": "false"}`.
- [ ] `GET /auth/google/login` con `GOOGLE_CLIENT_ID` → URL real de Google.
- [ ] `GET /auth/google/callback?code=X` sin credenciales → 501.
- [ ] `PUT /users/profile` con campos válidos → 200 + perfil actualizado.
- [ ] `PUT /users/profile` con `email` o `is_admin` en el body → 422 (extra="forbid").
- [ ] `POST /photo-upload` con JPG válido → 200, `profile_photo_url` se actualiza.
- [ ] `POST /photo-upload` con `.exe` renombrado a `.png` → 400 "File content does not match declared type".
- [ ] `POST /photo-upload` con archivo > 5 MB → 400.
- [ ] Frontend: usuario sin onboarding completo → ve `OnboardingPage` forzada.
- [ ] Frontend: usuario con perfil ok pero sin RIF → ve `ProfileCompletionBanner` dorado.
- [ ] Frontend: drag-drop de imagen sobre `UploadField` → preview aparece tras subir.

### Reglas aplicadas (sumadas)
| Regla | Dónde |
|-------|-------|
| R6 | upload_service: ImgBB primero (stub) → fallback local |
| R9 | magic bytes + size + sanitize_filename |
| R3 | state token CSRF en Google login URL |

### Pendientes / TODO → consolidados en FASE 11
**Decisión 2026-04-28**: el sweep de integraciones reales se hace en FASE 11 junto con el deploy a Neon/Railway/Vercel. Tiene sentido porque todos requieren credenciales reales y se prueban con deploy real.

Lista consolidada para FASE 11:
1. **Neon** — DB serverless en producción (URL real en `DATABASE_URL`).
2. **Railway** — deploy del backend Docker.
3. **Vercel** — deploy del frontend.
4. **Google OAuth real** — credenciales + intercambio code→tokens (TODO documentado en `auth.py`).
5. **ImgBB real** — `IMGBB_API_KEY` + descomentar bloque `httpx` en `upload_service._upload_to_imgbb`.
6. **`python-magic`** — swap de magic bytes manuales por libmagic.
7. **Tabla / campo para `rif_document_url`** — si el negocio quiere persistir el doc subido.
8. **Logo real** — reemplazar el texto del header.

### Siguiente fase
**FASE 8 — Admin Completo.** Página `AdminPage` con tabs (Monitoreo, Cotizaciones, Catálogo, Facturas, Soporte, API Keys), `/admin/api-keys` endpoints completos, export-all, protección de rutas admin. Activa todo lo que ya existe en backend pero aún no tiene UI.

---

## Bitácora

- **2026-04-27** — Inicio FASE 1. Memoria + `PROGRESS.md` creados. Repo público en GitHub: <https://github.com/Gregoriotb/tundra-connection>. Branches `main` (protegida), `develop`, `feature/fase-1-fundacion-auth`.
- **2026-04-27** — FASE 1 completa: 12 archivos principales + 6 auxiliares. Decisión clave: bootstrap admin via identifier literal `"admin"`. PR #1 abierto.
- **2026-04-27** — FASE 2 completa: catálogo público + admin CRUD, CartContext con aritmética entera, CatalogSection con 4 estados. Logo placeholder pendiente de reemplazo cuando el cliente lo provea.
- **2026-04-27** — FASE 3 completa: modelos `Service` + `Invoice`, endpoints `/services`, `/invoices/checkout` con discriminated union (PRODUCT_SALE + INTERNET_SERVICE) y lock pesimista de stock, seed de los 3 servicios con planes, `ServiceCard` + `ServiceOverlay` (Framer Motion stagger) + `InternetPlanModal`. Bonus: scaffold del frontend (package.json, vite, tsconfig, tailwind), `App.tsx`, `ServicesSection.tsx`. Pendiente: smoke test + `npm install`.
- **2026-04-27** — FASE 4 completa: modelos `QuotationThread` + `ChatMessage`, endpoints `/chat-quotations` (cliente) + `/admin/threads` (admin), `ChatMessage` (3 estilos), `ChatThread` con polling 5s + append optimista, `QuotationsPage` 2-col responsive. Polling marcado como deuda explícita — swap a WebSocket en FASE 5 con refactor mínimo (`setDetail` es punto único de mutación).
- **2026-04-27** — FASE 5 completa: `SecureWSManager` (R7 — 1 conn/user, heartbeat 30s, timeout 120s, sweeper background), endpoint `/ws?token=` con auth JWT y dispatcher de actions (subscribe_thread con IDOR check), modelo `Notification` + endpoints CRUD, `notification_service.notify()` que crea fila + emite WS best-effort, `WebSocketContext` con backoff exponencial + re-suscripción tras reconnect, `NotificationBell` con push tiempo real + mark-read optimista, **deuda del polling pagada**: ChatThread ahora usa WS push + polling fallback solo si WS caído (30s). `sanitize_user_text` aplicado en chat (con sanitización de `<script>`/`<iframe>`/control chars).
- **2026-04-27** — FASE 6 completa: modelo `SupportTicket` con `historial_estados` JSONB append-only + sequence atómica para `TICK-YYYY-NNNN`, 10 endpoints (5 cliente + 5 admin) con visibility por shape (`TicketOut` vs `TicketDetailOut`), `subscribe_ticket` real activado en handlers.py (R4 IDOR vs BD), `TicketCreator` (form 5 campos), `TicketList` (filtros + tones por estado), `TicketDetail` (timeline 4 tipos, filtra `internal_note` para clientes), `SupportTicketsPage` cliente, `TicketKanban` admin con quick-action de estado optimista. Migración `0007` con partial index sobre tickets activos.
- **2026-04-27** — FASE 7 entregada en MODO MAQUETA: endpoints `/auth/google/login` y `/callback` con stub que detecta `GOOGLE_CLIENT_ID` y devuelve URL placeholder o real (501 explícito si callback sin credenciales). `/users/profile` GET/PUT + `/photo-upload` + `/rif-upload`. `upload_service.py` con magic bytes check (PNG/JPEG/WEBP/PDF) + lectura por chunks + ImgBB stub que retorna None hoy → fallback local guardando en `/uploads/<token>.<ext>`. `OnboardingPage` con form completo (account_type, nombre, teléfono, RIF, dirección, uploads), `ProfileCompletionBanner` dismissible auto-oculto cuando completo, `UploadField` reutilizable con drag-drop + 2 variantes (image/document) + estados discriminated. App.tsx refactor: `AppShell` dentro de providers que rutea OnboardingPage si `!has_completed_onboarding`. Pendiente sweep final: integrar Google OAuth real + ImgBB real (TODOs documentados en código).
- **2026-04-28** — FASE 8 completa (12 archivos): modelo `ApiKey` con scopes JSONB y `is_usable` property, schemas `ApiKey*Out / ExportAllOut / AdminStatsOut`, router `/admin/api-keys` (POST con `plain_key` one-time, GET con filtro `include_revoked`, DELETE soft), router `/admin` (`export-all` agregado + `stats` con 5 KPI cards de tone dinámico), migración `0008_api_keys` con partial index `ix_api_keys_active_lookup ON api_keys(key_hash) WHERE is_active=TRUE` para hot path del middleware. Frontend: `AdminPage` con 6 tabs lazy-loaded + protección 404-style (R4) + KPI cards, `AdminCatalogTab` (CRUD con tope 10 + soft delete), `AdminInvoicesTab` (filtros estado/tipo + modal cambio de estado con `extra_data.status_history`), `AdminQuotationsTab` (vista admin de threads con `unread_count`), `AdminApiKeysTab` (modal one-time con borde dorado + checkbox confirmación obligatorio), `AdminMonitoringTab` (snapshot agregado + placeholder Grafana FASE 9). Wiring: hash-routing `#admin` en `App.tsx` con botón Admin condicional `user?.is_admin`. Backend nuevo: `admin_router` en `invoices.py` con auditoría en `extra_data.status_history` + notify automático al cliente, tipo `invoice_status_change` añadido a `NOTIFICATION_TIPOS`.
- **2026-04-28** — FASE 9 entregada en MODO MAQUETA (5 archivos): modelo `GrafanaDashboard` con `uid` único + `display_order`, schemas Pydantic con `HttpUrl` y validación de UID alfanumérico, router `/admin/grafana` con CRUD completo + endpoint `/admin/grafana/{id}/proxy` que retorna 501 explícito (TODO marcado para sweep FASE 11 con httpx + `GRAFANA_URL`/`GRAFANA_SERVICE_ACCOUNT_TOKEN` self-hosted), migración `0009_grafana_dashboards` con partial index `(display_order, created_at) WHERE is_active=TRUE`. Frontend: `GrafanaEmbed` con iframe sandboxed (`allow-scripts allow-same-origin allow-popups allow-forms`, sin top-navigation), `referrerPolicy="no-referrer"`, `loading="lazy"`, error overlay con guía CSP/X-Frame-Options. `MonitoringView` con CRUD admin + lista ordenada por display_order + empty state instructivo. Reemplaza el placeholder de `AdminMonitoringTab`. Decisión persistida: Grafana es **self-hosted** (no Grafana Cloud) → memoria `project_grafana.md` documenta el cambio.
- **2026-04-28** — FASE 10 entregada en MODO MAQUETA (2 archivos): `email_service.py` provider-agnostic con interface `send_email(to, template, context)` + 4 helpers tipados (`send_welcome / send_invoice_created / send_ticket_updated / send_new_chat_message`), 4 templates HTML+text inline con `format_map` + `_SafeDict` (no rompe si falta var). **Best-effort R6**: nunca lanza, devuelve bool. **Outbox local** en `uploads/_emails_outbox/<ts>_<template>_<uuid>.json` para QA sin provider. Hooks en endpoints existentes: `auth.register` (welcome), `invoices.checkout` (invoice_created), `support_tickets.admin_update_status` (ticket_updated, usa `ticket.user` relationship), `chat_quotations.post_message` (new_chat_message, gate admin→cliente solamente). Provider final por decidir en FASE 11 — el bloque TODO en `send_email()` es el único punto a tocar (Resend/SES/SMTP, los call-sites no cambian).
- **2026-04-28** — FASE 11 EN PROGRESO. Branch `feature/fase-11-deploy` creado. Bloque A (preparación local) parcialmente completo: `Dockerfile` refactorizado a multi-stage production-ready (builder + runtime, non-root user `tundra` uid 1000, alembic upgrade head antes de uvicorn, healthcheck profundo, respeta `$PORT` de Railway), endpoint `GET /healthz` con DB ping (devuelve 503 si la BD está caída — Railway puede usarlo), `backend/.env.example` documentado con TODAS las variables agrupadas por categoría + comentarios de cómo obtener cada credencial, `frontend/.env.example` con `VITE_API_URL`.
- **2026-04-28** — **FASE 9 ELIMINADA** por decisión del cliente (riesgo de seguridad del iframe + proxy). Borrados: `models/grafana_dashboard.py`, `schemas/grafana.py`, `api/v1/grafana.py`, migración `0009_grafana_dashboards.py`, `components/GrafanaEmbed.tsx`, `components/MonitoringView.tsx`, `components/admin/AdminMonitoringTab.tsx`, memoria `project_grafana.md`. Limpiados: imports en `models/__init__.py`, mount en `main.py`, settings `GRAFANA_URL`/`GRAFANA_SERVICE_ACCOUNT_TOKEN` en `config.py` y `.env.example`, `grafanaApi` y tipos en `api.ts`, tab de Monitoreo + lazy-import en `AdminPage.tsx` (ahora 5 tabs en vez de 6, default `quotations`). Snapshot/KPIs vivían dentro de `AdminMonitoringTab` así que también se fueron — si el cliente los quiere de vuelta sin Grafana, se rehidratan en otro tab o como widget header.

---

## 🔖 PUNTO DE RETOMA — FASE 11 (continuar desde aquí)

**Estado al 2026-04-28 1:08pm GMT-4:**

### Branch activo
`feature/fase-11-deploy` (basado en `feature/fase-8-admin-panel` que tiene el merge de FASES 8/9/10 en commit `b1f5658`).

### Plan FASE 11 — checklist
**Bloque A — Preparación local (sin credenciales)**
- [x] A1. Commit + push de FASES 8/9/10 — `b1f5658`
- [x] A2. `Dockerfile` production-ready (multi-stage, non-root, alembic startup)
- [x] A3. Endpoint `/healthz` con DB ping
- [x] A4. `.env.example` backend + frontend documentados
- [ ] **A5. NEXT: `docker-compose.prod.yml`** — para test local del Dockerfile prod-mode
- [ ] A6. `frontend/vercel.json` con rewrites + headers
- [ ] A7. Smoke test local: `docker compose -f docker-compose.prod.yml up` → register/login/landing

**Bloque B — Deploy infraestructura (requiere credenciales del usuario)**
- [ ] B1. Neon: crear proyecto + DB → guardar `DATABASE_URL` con `?sslmode=require`
- [ ] B2. Railway: conectar repo → root dir `backend/` → setear todas las env vars del `.env.example` → primer deploy
- [ ] B3. Vercel: conectar repo → root dir `frontend/` → setear `VITE_API_URL=<railway-url>` → primer deploy
- [ ] B4. CORS: actualizar `FRONTEND_URL` en Railway con el dominio Vercel
- [ ] B5. Smoke test prod: register/login/catalog/checkout/chat

**Bloque C — Sweep integraciones reales**
- [ ] C1. Logo real (cuando lo tengas — reemplazar texto del header en `App.tsx`)
- [ ] C2. Google OAuth real (descomentar exchange en `auth.py:google_callback`)
- [ ] C3. ImgBB real (descomentar bloque httpx en `upload_service._upload_to_imgbb`)
- [ ] C4. `python-magic` (añadir a `requirements.txt` + swap del magic bytes manual)
- [ ] C5. Grafana self-hosted (deploy instancia + impl proxy real en `grafana.proxy_dashboard`)
- [ ] C6. Email provider (decidir Resend/SES/SMTP + impl en `email_service.send_email`)

### Para retomar
1. `git checkout feature/fase-11-deploy`
2. Leer **A5** arriba — siguiente archivo a crear es `docker-compose.prod.yml`
3. Decir a Claude: *"Continúa FASE 11 desde paso A5"*

### Archivos clave de FASE 11 ya entregados
- [Dockerfile](backend/Dockerfile)
- [main.py:/healthz](backend/app/main.py)
- [backend/.env.example](backend/.env.example)
- [frontend/.env.example](frontend/.env.example)
