
2.1 Stack Tecnológico
Table
Capa	Tecnología	Hosting
Frontend	React 18 + Vite 5 + TypeScript 5 + Tailwind CSS 3	Vercel
Backend	Python 3.11 + FastAPI 0.110 + Uvicorn + SQLAlchemy 2 + Alembic	Railway (us-west)
Database	PostgreSQL 16 serverless	Neon
Auth	JWT (python-jose) + bcrypt + Google OAuth 2.0 (authlib)	—
Realtime	WebSocket nativo FastAPI	—
Email	Resend API o SMTP (SendGrid)	—
Uploads	ImgBB API + fallback local	—
Monitoreo	Grafana API (embed + datasource)	Grafana Cloud / Self-hosted
Local Dev	Docker Compose + Nginx gateway	—
2.2 Estructura de Carpetas
plain
Copy

tundra-connection/
├── frontend/                    # Vite + React + TS
│   ├── src/
│   │   ├── components/          # Atómicos (buttons, inputs, cards)
│   │   ├── sections/            # Secciones de página
│   │   ├── pages/               # Route-level components
│   │   ├── hooks/               # Custom hooks (useAuth, useWebSocket)
│   │   ├── contexts/            # React Contexts (Auth, Cart, WS)
│   │   ├── types/               # TypeScript interfaces (mirror backend)
│   │   ├── services/            # API clients (axios instances)
│   │   ├── utils/               # Helpers puros
│   │   └── assets/              # Imágenes estáticas
│   ├── public/
│   └── index.html
├── backend/
│   ├── app/
│   │   ├── api/                 # Routers FastAPI
│   │   │   ├── v1/
│   │   │   │   ├── auth.py
│   │   │   │   ├── users.py
│   │   │   │   ├── catalog.py
│   │   │   │   ├── services.py
│   │   │   │   ├── invoices.py
│   │   │   │   ├── chat_quotations.py
│   │   │   │   ├── support_tickets.py
│   │   │   │   ├── notifications.py
│   │   │   │   ├── admin.py
│   │   │   │   ├── api_keys.py
│   │   │   │   └── grafana.py
│   │   │   └── deps.py          # Dependencies (get_db, get_current_user)
│   │   ├── core/                # Config, security, constants
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── services/            # Lógica de negocio
│   │   ├── websocket/           # WS manager, handlers
│   │   ├── utils/               # Uploads, email, helpers
│   │   └── main.py
│   ├── alembic/                 # Migraciones
│   ├── tests/
│   └── Dockerfile
├── docker-compose.yml
└── nginx.conf

2.3 Patrones Obligatorios
A. WebSocket Singleton (Backend)
Python
Copy

# app/websocket/manager.py
class WSManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
    
    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active_connections[user_id] = ws
    
    async def disconnect(self, user_id: str):
        self.active_connections.pop(user_id, None)
    
    async def send_to_user(self, user_id: str, message: dict):
        if ws := self.active_connections.get(user_id):
            await ws.send_json(message)
    
    async def broadcast(self, message: dict, user_ids: list[str] = None):
        targets = user_ids or list(self.active_connections.keys())
        for uid in targets:
            await self.send_to_user(uid, message)

ws_manager = WSManager()

B. WebSocket Provider (Frontend)

    Una sola conexión WS en root de la app
    Reconexión exponencial (1s, 2s, 4s, 8s, max 30s)
    Heartbeat cada 30s (ping → pong)
    Suscripción a threads de chat y tickets de soporte

C. Dual Auth Dependency
Python
Copy

async def get_admin_via_any_auth(
    token: str = Depends(oauth2_scheme),
    api_key: str = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db)
):
    # 1. Intentar JWT
    # 2. Si falla, intentar API Key
    # 3. Verificar is_admin = True
    # 4. Retornar usuario

D. Upload Helper
Python
Copy

async def upload_file(file: UploadFile) -> str:
    # 1. Intentar ImgBB
    # 2. Si falla, guardar en /uploads/ con UUID
    # 3. Retornar URL pública

E. Notificación Helper
Python
Copy

async def notify(user_id: str, tipo: str, payload: dict, db: Session):
    # 1. Crear registro en DB
    # 2. Enviar por WS si usuario está conectado
    # 3. Enviar email si es crítico (configurable)