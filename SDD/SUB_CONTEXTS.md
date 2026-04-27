SC-001: Fundación y Auth
Scope: Docker, FastAPI, DB local, JWT auth, User model, migraciones.
Entregables:

    docker-compose.yml funcional
    Auth register/login con bcrypt
    Middleware CORS correcto
    Migración inicial de users

SC-002: Catálogo Mínimo + Carrito
Scope: CRUD catalog_items (máx 10), CartContext en React, checkout básico.
Entregables:

    Endpoints /catalog y /admin/catalog
    Vista catálogo en landing
    Carrito persistente (localStorage + DB)
    Invoice PRODUCT_SALE funcional

SC-003: Servicios con Overlays de Prestigio
Scope: Landing con 3 cards de servicio, overlays animados, modales de contratación.
Entregables:

    Componente ServiceOverlay con animaciones Framer Motion
    Modal de contratación internet (dirección + plan)
    Generación de Invoice INTERNET_SERVICE
    Seed data de servicios y planes

SC-004: Chat-Cotizaciones (Servicios Extras)
Scope: QuotationThread + ChatMessage, WebSocket básico.
Entregables:

    Crear hilo desde overlay de servicios extras
    Chat básico (polling primero, luego WS)
    Estados del hilo (pending → active → quoted → ...)
    Notificaciones de nuevo mensaje

SC-005: WebSocket + Notificaciones
Scope: WebSocketProvider, reconexión, heartbeat, campana de notificaciones.
Entregables:

    WSManager singleton en backend
    WebSocketProvider en React root
    Campana con badge realtime
    Notificaciones persistentes en DB

SC-006: Sistema de Reportes de Fallas (Alloy-style)
Scope: SupportTicket CRUD, estados, adjuntos, asignación, timeline.
Entregables:

    Modelo SupportTicket con historial_estados JSONB
    Vista cliente: crear ticket, ver estado, responder
    Vista admin: kanban/tabla, cambiar estado, notas internas, asignar
    Notificaciones por email al cambiar estado
    Adjuntos en tickets

SC-007: OAuth Google + Onboarding
Scope: Google OAuth, onboarding forzado, perfil fiscal.
Entregables:

    /auth/google/* endpoints
    Vista /onboarding (tipo de cuenta, teléfono)
    Banner condicional en dashboard si falta RIF/dirección
    Upload de foto y RIF

SC-008: Admin Completo
Scope: Panel admin con todas las vistas.
Entregables:

    Tabs: Monitoreo, Cotizaciones, Catálogo, Facturas, Soporte, API Keys
    Protección de rutas admin
    Export-all endpoint
    CRUD API Keys

SC-009: Grafana Integration
Scope: Conectar API de Grafana, embed dashboards, proxy.
Entregables:

    Modelo GrafanaDashboard
    Endpoints /admin/grafana/*
    Vista Monitoreo con iframes embed
    Autenticación con Grafana (API Key o Service Account)

SC-010: Email Service + Notificaciones Avanzadas
Scope: Resend/SendGrid, templates de email.
Entregables:

    Helper send_email() con templates HTML
    Emails: bienvenida, factura creada, ticket actualizado, nuevo mensaje chat
    Configurable en Ajustes Globales

SC-011: Deploy y Producción
Scope: Railway, Vercel, Neon, dominio, SSL.
Entregables:

    Backend en Railway (us-west)
    Frontend en Vercel
    Neon DB con SSL
    Variables de entorno documentadas
    Health check endpoint