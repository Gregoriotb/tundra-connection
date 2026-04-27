Fase 1: Fundación (Semana 1)

    Setup repo + docker-compose (Postgres 16, FastAPI, Nginx)
    Configurar Tailwind + estructura React
    Auth JWT (register/login) + User model
    Migraciones Alembic + seed básico
    CORS + headers de seguridad

Fase 2: Catálogo + Carrito (Semana 1-2)

    Modelo CatalogItem + endpoints
    Vista catálogo en landing (máx 10 items)
    CartContext (localStorage + persistencia DB)
    Checkout productos → Invoice PRODUCT_SALE

Fase 3: Servicios + Overlays (Semana 2)

    Seed data de 3 servicios con planes JSONB
    Componente ServiceOverlay con Framer Motion
    Modal contratación internet → Invoice INTERNET_SERVICE
    Tests de integración

Fase 4: Chat-Cotizaciones (Semana 3)

    Modelos QuotationThread + ChatMessage
    Endpoints CRUD + WS básico
    Vista cliente: lista de hilos + chat
    Vista admin: lista de cotizaciones

Fase 5: WebSocket + Notificaciones (Semana 3-4)

    WSManager singleton
    WebSocketProvider en React
    Campana notificaciones con badge
    Reemplazar polling en chat

Fase 6: Reportes de Fallas (Semana 4-5)

    Modelo SupportTicket + historial
    Vista cliente: crear/ver tickets
    Vista admin: kanban + detalle
    Estados + asignación + adjuntos
    Email notifications

Fase 7: OAuth + Onboarding (Semana 5)

    Google OAuth flow
    Vista onboarding forzado
    Perfil fiscal completo
    Uploads foto/RIF

Fase 8: Admin + API Keys (Semana 6)

    Panel admin completo
    Export-all endpoint
    Sistema API Keys
    Dual-auth

Fase 9: Grafana (Semana 6-7)

    Conexión API Grafana
    Modelo GrafanaDashboard
    Vista Monitoreo con embeds
    Proxy seguro

Fase 10: Deploy + Polish (Semana 7-8)

    Railway + Vercel + Neon
    Dominio + SSL
    Rate limiting
    Optimización imágenes
    PWA básico (manifest, service worker)