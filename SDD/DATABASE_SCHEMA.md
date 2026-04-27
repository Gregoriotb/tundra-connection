3.1 Tablas Core
sql
Copy

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    account_type VARCHAR(20) CHECK (account_type IN ('empresa', 'particular')),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    rif_cedula VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    profile_photo_url TEXT,
    google_id VARCHAR(255) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CATALOG ITEMS (máx 10 registros)
-- ============================================
CREATE TABLE IF NOT EXISTS catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tipo VARCHAR(50) CHECK (tipo IN ('router', 'camara', 'equipo_red', 'accesorio')),
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SERVICES (3 registros fijos: fibra, satelital, extras)
-- ============================================
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL, -- 'fibra_optica', 'satelital', 'servicios_extras'
    name VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    description TEXT,
    icon_name VARCHAR(50), -- para lucide-react
    precio_instalacion_base DECIMAL(10,2) DEFAULT 0,
    planes JSONB DEFAULT '[]', -- array de planes con velocidad, precio, etc.
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INTERNET PLANS (planes dentro de services.planes JSONB)
-- Estructura JSONB esperada:
-- [
--   {
--     "id": "plan_50mb",
--     "nombre": "50 Mbps",
--     "velocidad": "50mb",
--     "precio_mensual": 25.00,
--     "tipo_plan": "residencial",
--     "caracteristicas": ["Simétrico", "IP Estática opcional"]
--   }
-- ]
-- ============================================

-- ============================================
-- INVOICES
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo VARCHAR(50) CHECK (tipo IN ('PRODUCT_SALE', 'INTERNET_SERVICE', 'SERVICE_QUOTATION')),
    estado VARCHAR(50) DEFAULT 'pending' CHECK (estado IN ('pending', 'paid', 'cancelled', 'overdue', 'refunded')),
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    items JSONB NOT NULL, -- array de line items
    direccion_instalacion TEXT, -- para servicios de internet
    plan_seleccionado JSONB, -- para servicios de internet
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- QUOTATION THREADS (solo servicios extras)
-- ============================================
CREATE TABLE IF NOT EXISTS quotation_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id),
    estado VARCHAR(50) DEFAULT 'pending' CHECK (estado IN ('pending', 'active', 'quoted', 'negotiating', 'closed', 'cancelled')),
    presupuesto_estimado DECIMAL(10,2),
    requerimiento_inicial TEXT,
    direccion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CHAT MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES quotation_threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'attachment')),
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SUPPORT TICKETS (Reportes de Fallas — Alloy-style)
-- ============================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL, -- TICK-2026-0001
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo VARCHAR(20) CHECK (tipo IN ('incidencia', 'requerimiento')),
    servicio_relacionado VARCHAR(50) CHECK (servicio_relacionado IN ('fibra_optica', 'satelital', 'servicios_extras', 'otro')),
    estado VARCHAR(50) DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_revision', 'remitido', 'en_proceso', 'solucionado', 'cancelado')),
    prioridad VARCHAR(20) DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'critica')),
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    adjuntos JSONB DEFAULT '[]',
    notas_internas TEXT, -- solo visible para admin
    historial_estados JSONB DEFAULT '[]',
    assigned_to UUID REFERENCES users(id),
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL, -- 'chat_message', 'quotation_status', 'invoice_created', 'ticket_updated', 'ticket_assigned'
    payload JSONB NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- API KEYS
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(64) NOT NULL, -- SHA-256
    scopes JSONB DEFAULT '["read"]',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- GRAFANA DASHBOARDS
-- ============================================
CREATE TABLE IF NOT EXISTS grafana_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    uid VARCHAR(100) UNIQUE NOT NULL,
    url_embed TEXT NOT NULL,
    variables JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_estado ON invoices(estado);
CREATE INDEX IF NOT EXISTS idx_quotation_threads_user_id ON quotation_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_estado ON support_tickets(estado);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read_at);

3.2 Datos Semilla (Seed Data)
sql
Copy

-- Servicios fijos (3 registros)
INSERT INTO services (slug, name, subtitle, description, icon_name, precio_instalacion_base, planes, display_order) VALUES
('fibra_optica', 'Fibra Óptica', 'Conexión Simétrica de Alta Velocidad', 'Internet empresarial y residencial por fibra óptica con latencia mínima y capacidad de hasta 10Gbps.', 'wifi', 50.00, '[
  {"id":"fibra_50mb","nombre":"50 Mbps","velocidad":"50mb","precio_mensual":25.00,"tipo_plan":"residencial","caracteristicas":["Simétrico","Soporte 24/7"]},
  {"id":"fibra_100mb","nombre":"100 Mbps","velocidad":"100mb","precio_mensual":35.00,"tipo_plan":"residencial","caracteristicas":["Simétrico","IP Estática opcional"]},
  {"id":"fibra_250mb","nombre":"250 Mbps","velocidad":"250mb","precio_mensual":55.00,"tipo_plan":"empresarial","caracteristicas":["Simétrico","IP Estática","SLA 99.9%"]},
  {"id":"fibra_500mb","nombre":"500 Mbps","velocidad":"500mb","precio_mensual":85.00,"tipo_plan":"empresarial","caracteristicas":["Simétrico","IP Estática dedicada","SLA 99.95%"]},
  {"id":"fibra_1gb","nombre":"1 Gbps","velocidad":"1gb","precio_mensual":150.00,"tipo_plan":"empresarial","caracteristicas":["Simétrico","IP Estática dedicada","SLA 99.99%","Ingeniero dedicado"]}
]', 1),

('satelital', 'Internet Satelital', 'Conectividad para Zonas Remotas', 'Solución ideal para zonas sin cobertura terrestre. Conectividad estable vía satélite con cobertura nacional.', 'satellite', 120.00, '[
  {"id":"sat_10mb","nombre":"10 Mbps","velocidad":"10mb","precio_mensual":45.00,"tipo_plan":"residencial","caracteristicas":["Asimétrico","Antena incluida"]},
  {"id":"sat_20mb","nombre":"20 Mbps","velocidad":"20mb","precio_mensual":65.00,"tipo_plan":"residencial","caracteristicas":["Asimétrico","Antena incluida","Soporte prioritario"]},
  {"id":"sat_50mb","nombre":"50 Mbps","velocidad":"50mb","precio_mensual":95.00,"tipo_plan":"empresarial","caracteristicas":["Asimétrico","Antena profesional","SLA 99.5%"]},
  {"id":"sat_100mb","nombre":"100 Mbps","velocidad":"100mb","precio_mensual":150.00,"tipo_plan":"empresarial","caracteristicas":["Asimétrico","Antena profesional","SLA 99.5%","Backup 4G"]}
]', 2),

('servicios_extras', 'Servicios Extras', 'Soluciones Técnicas Personalizadas', 'Circuito cerrado, instalación de servidores, mantenimiento de infraestructura y consultoría especializada.', 'settings', 0.00, '[
  {"id":"extra_cctv","nombre":"Circuito Cerrado (CCTV)","descripcion":"Instalación de sistemas de videovigilancia 4K con acceso remoto y detección de movimiento.","precio_desde":200.00},
  {"id":"extra_servidor","nombre":"Instalación de Servidores","descripcion":"Montaje, configuración y puesta en marcha de servidores físicos y virtuales.","precio_desde":350.00},
  {"id":"extra_mantenimiento","nombre":"Mantenimiento de Redes","descripcion":"Mantenimiento preventivo y correctivo de infraestructura de red y telecomunicaciones.","precio_desde":150.00},
  {"id":"extra_consultoria","nombre":"Consultoría IT","descripcion":"Auditoría de red, mapas de calor WiFi y diseño de topologías.","precio_desde":100.00}
]', 3);

-- Catálogo inicial (ejemplo de 5 items)
INSERT INTO catalog_items (name, description, tipo, price, stock, image_url) VALUES
('Router TP-Link AX3000', 'Router WiFi 6 de doble banda, ideal para hogares y pequeñas oficinas.', 'router', 85.00, 15, 'https://i.ibb.co/example1.jpg'),
('Cámara Hikvision 4MP', 'Cámara IP 4MP con visión nocturna color y detección de personas.', 'camara', 120.00, 8, 'https://i.ibb.co/example2.jpg'),
('Switch Ubiquiti 8 Puertos', 'Switch gestionable de 8 puertos Gigabit con PoE.', 'equipo_red', 150.00, 5, 'https://i.ibb.co/example3.jpg'),
('Access Point UniFi 6', 'Punto de acceso WiFi 6 de techo, cobertura de hasta 140m².', 'equipo_red', 180.00, 10, 'https://i.ibb.co/example4.jpg'),
('Cámara PTZ 20x Zoom', 'Cámara motorizada con zoom óptico 20x, ideal para exteriores.', 'camara', 450.00, 3, 'https://i.ibb.co/example5.jpg');