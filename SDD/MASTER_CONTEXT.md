1.1 Visión del Producto
Tundra Connection es una plataforma web B2B/B2C para una empresa de telecomunicaciones que ofrece:

    Internet por Fibra Óptica (planes residenciales/empresariales)
    Internet Satelital (zonas remotas)
    Servicios Técnicos Extras (circuito cerrado, servidores, mantenimiento)

A diferencia de CJDG (distribuidora con catálogo masivo), Tundra tiene:

    Catálogo mínimo: máximo 10 productos físicos (routers, cámaras, equipos de red)
    Servicios con overlays de prestigio: 3 servicios principales con transiciones animadas
    Facturación directa para servicios de internet (fibra/satélite) — no requieren cotización
    Chat-cotización solo para Servicios Extras
    Sistema de Reportes de Fallas tipo Alloy para soporte técnico
    Módulo de Monitoreo con Grafana/UISP

1.2 Principios Arquitectónicos (NO NEGOCIABLES)
Table
#	Principio	Descripción
1	Spec-First	Todo código debe mapearse a una sección de este documento. Si no está aquí, no se implementa.
2	Type Safety Total	Frontend: TypeScript estricto (strict: true). Backend: Pydantic v2 en TODOS los endpoints.
3	Auth Dual	JWT Bearer para usuarios normales. X-API-Key SHA-256 para integraciones externas. Nunca mezclar.
4	Idempotencia DB	Migraciones con IF NOT EXISTS. Nunca borrar datos en migraciones.
5	Upload Resiliente	ImgBB primero, filesystem local como fallback. Railway tiene FS efímero.
6	WebSocket Único	Una conexión WS por usuario para notificaciones, chat y actualizaciones de reportes.
7	CORS Estricto	allow_origins=["*"] + allow_credentials=False. Auth vía Bearer, nunca cookies.
8	No Polling	WebSocket reemplaza polling en chat, notificaciones y reportes.
9	Validación Server-Side	Nunca confiar en validación del frontend. Siempre validar en FastAPI.
10	SQL Injection Proof	SQLAlchemy ORM obligatorio. Nunca concatenar strings en queries.
1.3 Entidades de Negocio
plain
Copy

User (cliente/admin)
├── account_type: "empresa" | "particular"
├── perfil_fiscal: RIF/cédula, dirección, teléfono
└── has_password (para OAuth-only)

CatalogItem (máx 10 registros)
├── tipo: "router" | "camara" | "equipo_red"
├── precio, stock, imagen

Service (3 registros fijos en DB, no CRUD admin)
├── tipo: "fibra_optica" | "satelital" | "servicios_extras"
├── planes: JSONB (array de objetos plan)
└── precio_instalacion_base

InternetPlan (dentro de Service.planes JSONB)
├── velocidad: "50mb" | "100mb" | "250mb" | "500mb" | "1gb"
├── precio_mensual
└── tipo_plan: "residencial" | "empresarial"

Invoice
├── tipo: "PRODUCT_SALE" | "INTERNET_SERVICE" | "SERVICE_QUOTATION"
├── estado: "pending" | "paid" | "cancelled" | "overdue"
└── items: JSONB

QuotationThread (solo para servicios extras)
├── estado: "pending" | "active" | "quoted" | "negotiating" | "closed" | "cancelled"
├── service_id (FK a Service tipo servicios_extras)
└── presupuesto_estimado (opcional)

ChatMessage
├── thread_id, user_id, content, attachments
└── message_type: "text" | "system" | "attachment"

SupportTicket (Reportes de Fallas — tipo Alloy)
├── tipo: "incidencia" | "requerimiento"
├── servicio_relacionado: "fibra_optica" | "satelital" | "servicios_extras" | "otro"
├── estado: "abierto" | "en_revision" | "remitido" | "en_proceso" | "solucionado" | "cancelado"
├── prioridad: "baja" | "media" | "alta" | "critica"
├── descripcion, adjuntos, notas_internas (solo admin)
└── historial_estados: JSONB (array de cambios con timestamp y usuario)

Notification
├── user_id, tipo, payload, read_at
└── vía WS + persistencia DB

ApiKey
├── hash SHA-256 en DB, raw mostrada UNA SOLA VEZ
├── expires_at opcional
└── scopes: "read" | "write" | "admin"

GrafanaDashboard
├── nombre, uid, url_embed, variables JSONB
└── activo: boolean
