5.1 Identidad Visual
Table
Elemento	Valor
Fondo principal	#050505 (negro profundo)
Fondo secundario	#0a0a0a
Acento oro	#C5A059
Acento oro brillante	#FACC15
Texto principal	#FFFFFF
Texto secundario	rgba(255,255,255,0.5)
Texto muted	rgba(255,255,255,0.3)
Borde dorado	rgba(197, 160, 89, 0.2)
Danger	#DC3545
Success	#198754
Warning	#FFC107
Font headings	'Archivo Black', sans-serif
Font body	'Outfit', sans-serif
5.2 Animaciones y Transiciones
Overlay de Servicios (Prestigio)
Cuando el usuario hace clic en "Servicios" desde el landing o navegación:

    Trigger: Click en card de servicio
    Animación de entrada:
        Overlay oscuro (rgba(0,0,0,0.95)) fade-in 300ms
        Card central scale desde 0.8 a 1.0 + opacity 0→1, duración 400ms, easing cubic-bezier(0.16, 1, 0.3, 1)
        Contenido interno stagger: título → descripción → planes → botón, 100ms entre cada uno
    Animación de salida:
        Card scale 1.0→0.95 + opacity 1→0, 200ms
        Overlay fade-out 300ms
    Backdrop blur: backdrop-filter: blur(20px) en el overlay

Planes de Internet ( dentro del overlay)

    Cards de plan en grid 1-col (mobile) / 3-col (desktop)
    Hover: border-color cambia a #C5A059, translateY(-4px), box-shadow con glow dorado sutil
    Plan seleccionado: borde sólido 2px #C5A059, checkmark animado

Modal de Contratación

    Aparece desde abajo (mobile) o centrado con scale (desktop)
    Campos: Dirección (textarea), Selector de plan (ya pre-seleccionado), Notas opcionales
    Botón "Generar Factura" con loading state y spinner dorado

5.3 Estructura de Vistas
Landing Page (/)

    Hero con canvas animado (partículas doradas existentes)
    3 Cards de Servicios en fila (Fibra, Satelital, Extras)
    Catálogo mini (máx 6 items visibles, "Ver más" si hay más)
    Footer minimalista

Cliente Dashboard (/dashboard)
Header fijo:

    Logo Tundra
    Campana de notificaciones (badge rojo con contador)
    Avatar usuario (dropdown: Perfil, Facturas, Tickets, Cerrar sesión)

Sidebar izquierda (mobile: drawer, desktop: fixed):

    Inicio
    Mis Servicios (estado de internet contratado)
    Catálogo
    Carrito
    Cotizaciones (solo si tiene hilos activos)
    Facturas
    Reportar Falla (Support Tickets)
    Mi Perfil

Secciones principales:

    Inicio: Resumen (servicio activo, facturas pendientes, tickets abiertos)
    Catálogo: Grid de productos, add to cart
    Carrito: Lista + checkout
    Facturas: Tabla con estado, descargar PDF
    Cotizaciones: Lista de hilos, chat al hacer click
    Reportar Falla:
        Botón "Nuevo Reporte" → Modal
        Lista de tickets con estado (color-coded badges)
        Click para ver detalle + historial + respuestas

Admin Dashboard (/admin)
Tabs/Sidebar:

    📊 Monitoreo (Grafana embeds)
    💬 Cotizaciones (chat realtime)
    🛒 Catálogo (CRUD)
    📄 Facturación
    🎫 Soporte Técnico (Tickets Alloy-style)
    🔑 API Keys
    ⚙️ Ajustes

Vista Tickets (Alloy-style):

    Kanban board por estado (Abiertos, En Revisión, En Proceso, Solucionados, Cancelados)
    O tabla con filtros (estado, prioridad, asignado, fecha)
    Click en ticket → Panel lateral con:
        Info del cliente
        Descripción
        Historial de estados (timeline vertical)
        Notas internas (textarea + guardar)
        Adjuntos (galería)
        Acciones: Cambiar estado, Asignar, Responder al cliente

5.4 Responsive Breakpoints
Table
Breakpoint	Ancho	Comportamiento
Mobile	< 768px	Single column, drawer nav, modales full-screen
Tablet	768px - 1024px	2 columns, sidebar colapsable
Desktop	> 1024px	Full layout, sidebar fija, overlays centrados
6. SECURITY_RULES.md
6.1 Lista de Vulnerabilidades a Prevenir
Table
#	Vulnerabilidad	Prevención
1	SQL Injection	SQLAlchemy ORM obligatorio. Nunca usar f-strings ni concatenación en queries.
2	XSS	Escapar todo output en frontend (React lo hace por defecto). Sanitizar HTML si se usa dangerouslySetInnerHTML.
3	CSRF	No usar cookies para auth. Usar JWT Bearer en header.
4	IDOR	Verificar ownership en CADA endpoint: if resource.user_id != current_user.id: raise 403.
5	Mass Assignment	Pydantic schemas con extra='forbid'. Nunca exponer campos sensibles en schemas de entrada.
6	File Upload	Validar MIME type, tamaño máximo 10MB, escanear extensión. Nunca ejecutar archivos subidos.
7	Path Traversal	Usar os.path.basename() + UUID para nombres de archivo.
8	JWT Secret	SECRET_KEY mínimo 64 caracteres aleatorios. Rotar cada 90 días.
9	Rate Limiting	100 req/min por IP, 10 req/min en auth. Usar slowapi o middleware custom.
10	CORS	allow_origins=["*"] + allow_credentials=False. NUNCA allow_credentials=True con *.
11	Passwords	bcrypt con 12 rounds. Nunca almacenar en texto plano.
12	API Keys	SHA-256 en DB, raw mostrada UNA SOLA VEZ. Nunca loggear keys.
13	Email Injection	Validar emails con Pydantic EmailStr. Sanitizar headers.
14	DoS	Límite de tamaño en requests (10MB). Timeouts en queries DB (30s).
15	Open Redirect	Validar URLs de redirect en OAuth contra whitelist.
6.2 Headers de Seguridad (Nginx/FastAPI)
plain
Copy

X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://i.ibb.co data: blob:; connect-src 'self' wss:;
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()

6.3 Validaciones Server-Side Obligatorias
Python
Copy

# Ejemplo Pydantic
class CreateInvoiceRequest(BaseModel):
    tipo: Literal["PRODUCT_SALE", "INTERNET_SERVICE"]
    service_id: UUID | None = None
    plan_id: str | None = None
    direccion_instalacion: str | None = None
    
    @field_validator('plan_id')
    @classmethod
    def validate_plan(cls, v, info):
        if info.data.get('tipo') == 'INTERNET_SERVICE' and not v:
            raise ValueError('plan_id requerido para servicios de internet')
        return v
    
    @field_validator('direccion_instalacion')
    @classmethod
    def validate_direccion(cls, v, info):
        if info.data.get('tipo') == 'INTERNET_SERVICE' and (not v or len(v.strip()) < 10):
            raise ValueError('Dirección de instalación requerida (mínimo 10 caracteres)')
        return v