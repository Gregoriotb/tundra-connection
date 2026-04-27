🔒 SECURITY_RULES.md — Tundra Connection

    Versión: 1.0.0 | Clasificación: CRÍTICO | Stack: FastAPI + React + PostgreSQL + Grafana
    REGLA DE ORO: "La seguridad no es una feature, es un requisito no funcional que si falla, destruye el negocio."

📋 ÍNDICE

    Threat Model
    OWASP Top 10 — Mitigaciones Específicas
    Autenticación y Autorización
    Validación y Sanitización de Datos
    Seguridad de WebSocket
    Seguridad de Archivos y Uploads
    Seguridad de Base de Datos
    Seguridad de Infraestructura
    Seguridad de Grafana y Monitoreo
    Headers HTTP y Configuración CORS
    Rate Limiting y Protección Anti-DoS
    Manejo de Secretos y Variables de Entorno
    Logging y Auditoría de Seguridad
    Incident Response Básico
    Checklist Pre-Deploy de Seguridad

1. Threat Model
1.1 Activos Críticos
Table
Activo	Sensibilidad	Impacto si comprometido
Base de datos (clientes, facturas, RIF)	ALTA	Violación GDPR/Ley de Protección de Datos, fraude fiscal
API Keys de Grafana/UISP	CRÍTICA	Acceso a infraestructura de red, sabotaje, espionaje industrial
JWT Secret	CRÍTICA	Suplantación de identidad de cualquier usuario/admin
Archivos subidos (RIF, fotos)	MEDIA	Suplantación de identidad, phishing
WebSocket connections	ALTA	Escucha de conversaciones privadas, filtrado de datos comerciales
Panel Admin	CRÍTICA	Control total del sistema, manipulación de facturas, eliminación de evidencia
1.2 Vectores de Ataque Principales

    Credential Stuffing → Fuerza bruta en /auth/login
    IDOR → Usuario A ve facturas/tickets de Usuario B cambiando UUID en URL
    SQL Injection → A través de parámetros de búsqueda o filtros mal sanitizados
    XSS Stored → Mensajes de chat o descripciones de tickets con payload JS
    File Upload RCE → Subir .php, .jsp o archivos con double extension
    WS Hijacking → Robar JWT y conectar al WebSocket como otro usuario
    Grafana SSRF → Explotar proxy de Grafana para escanear red interna
    Mass Assignment → Enviar campos extra en JSON para escalar privilegios

2. OWASP Top 10 — Mitigaciones Específicas
A01: Broken Access Control
Problema: Usuario accede a recursos de otro usuario.
Mitigación obligatoria:
Python
Copy

# backend/app/api/deps.py
from fastapi import HTTPException, status

async def get_resource_owner(
    resource_id: UUID,
    model: Type[BaseModel],
    db: Session,
    current_user: User
):
    resource = db.query(model).filter(model.id == resource_id).first()
    if not resource:
        raise HTTPException(404, "Not found")

    # Admin puede ver todo
    if current_user.is_admin:
        return resource

    # Usuario solo puede ver lo suyo
    if hasattr(resource, "user_id") and resource.user_id != current_user.id:
        logger.warning(
            f"IDOR attempt: user={current_user.id} tried to access "
            f"{model.__name__}={resource_id}"
        )
        raise HTTPException(403, "Access denied")

    return resource

Regla: CADA endpoint que retorna un recurso individual DEBE verificar ownership.
A02: Cryptographic Failures
Problema: Datos sensibles expuestos en tránsito o reposo.
Mitigación:
Python
Copy

# backend/app/core/security.py
from passlib.context import CryptContext
import secrets

pwd_context = CryptContext(
    schemes=["bcrypt"], 
    deprecated="auto", 
    bcrypt__rounds=12
)

# JWT
SECRET_KEY = secrets.token_urlsafe(64)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# API Keys
API_KEY_LENGTH = 64

def generate_api_key() -> str:
    return secrets.token_urlsafe(API_KEY_LENGTH)

def hash_api_key(raw_key: str) -> str:
    import hashlib
    return hashlib.sha256(raw_key.encode()).hexdigest()

Reglas:

    JWT Secret: mínimo 64 caracteres, rotar cada 90 días
    Contraseñas: bcrypt con 12 rounds
    API Keys: SHA-256 en DB, raw mostrada UNA SOLA VEZ
    PII (RIF, teléfono): NO encriptar en DB (necesario para facturación), pero SÍ en backups
    Conexiones DB: SSL obligatorio (sslmode=require)

A03: Injection
Problema: SQL Injection, NoSQL Injection, Command Injection.
Mitigación ABSOLUTA:
Python
Copy

# ❌ PROHIBIDO — NUNCA HACER ESTO
def search_users_bad(db: Session, query: str):
    return db.execute(
        f"SELECT * FROM users WHERE name LIKE '%{query}%'"
    )

# ✅ OBLIGATORIO — SQLAlchemy ORM siempre
def search_users_good(db: Session, query: str):
    return db.query(User).filter(
        User.name.ilike(f"%{query}%")
    ).all()

# ✅ Si se necesita raw SQL, usar parámetros bind
def complex_query(db: Session, user_id: UUID):
    return db.execute(
        text("SELECT * FROM invoices WHERE user_id = :uid"),
        {"uid": str(user_id)}
    )

Regla de hierro: NUNCA concatenar strings en queries. NUNCA usar f-strings en SQL.
A04: Insecure Design
Problema: Flujos de negocio que permiten abuso.
Mitigaciones de diseño:

    Facturas: No permitir modificación después de paid. Solo cancelled por admin con justificación.
    Tickets: Cliente no puede cambiar estado a solucionado directamente. Debe ser admin.
    Chat: Usuario no puede enviar mensajes en hilo closed o cancelled.
    Carrito: Límite de 50 items por carrito para evitar DoS.
    Precios: Validar precio server-side en checkout, NUNCA confiar en precio enviado por frontend.

A05: Security Misconfiguration
Mitigación:
Python
Copy

# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app = FastAPI(
    title="Tundra API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["api.tundraconnection.com", "localhost"]
)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL")],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    max_age=600,
)

A06: Vulnerable and Outdated Components
Mitigación:

    Usar pip-audit o safety para escanear dependencias
    GitHub Dependabot activado
    Pin de versiones exactas en requirements.txt:

plain
Copy

fastapi==0.110.0
sqlalchemy==2.0.28
pydantic==2.6.4
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4

A07: Identification and Authentication Failures
Mitigaciones:

    Rate limiting en auth: 5 intentos por IP cada 15 minutos
    Bloqueo temporal después de 10 intentos fallidos
    JWT con expiración corta (30 min), refresh token (7 días)
    Invalidar tokens en logout (blacklist)
    Password strength: mínimo 8 caracteres, 1 mayúscula, 1 número, 1 especial
    No permitir passwords comunes

Python
Copy

# backend/app/core/password_policy.py
COMMON_PASSWORDS = set()

def validate_password_strength(password: str) -> bool:
    if len(password) < 8:
        return False
    if not any(c.isupper() for c in password):
        return False
    if not any(c.isdigit() for c in password):
        return False
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        return False
    if password.lower() in COMMON_PASSWORDS:
        return False
    return True

A08: Software and Data Integrity Failures
Mitigación:

    Validar checksum de archivos subidos
    No deserializar datos no confiables (pickle, yaml.load)
    Usar json.loads() con schema validation
    CI/CD con firmas de commits

A09: Security Logging and Monitoring Failures
Mitigación:

    Loggear TODOS los intentos de login (éxito y fracaso)
    Loggear cambios de estado en tickets y cotizaciones
    Loggear acceso a datos sensibles (facturas, RIF)
    Loggear creación/eliminación de API Keys
    Retención de logs: mínimo 90 días

Python
Copy

# backend/app/core/audit.py
import logging
from datetime import datetime

audit_logger = logging.getLogger("audit")

def log_security_event(
    event_type: str,
    user_id: str | None,
    ip_address: str,
    details: dict,
    severity: str = "info"
):
    audit_logger.log(
        getattr(logging, severity.upper()),
        {
            "timestamp": datetime.utcnow().isoformat(),
            "event": event_type,
            "user_id": user_id,
            "ip": ip_address,
            "details": details
        }
    )

A10: Server-Side Request Forgery (SSRF)
Problema crítico con Grafana: El proxy a Grafana puede ser explotado para escanear la red interna.
Mitigación:
Python
Copy

# backend/app/api/grafana.py
import ipaddress
from urllib.parse import urlparse

BLOCKED_HOSTS = [
    "localhost", "127.0.0.1", "0.0.0.0",
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
    "169.254.0.0/16", "::1", "fc00::/7"
]

def is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        return False
    try:
        ip = ipaddress.ip_address(hostname)
        for blocked in BLOCKED_HOSTS:
            if "/" in blocked:
                if ip in ipaddress.ip_network(blocked):
                    return False
            elif str(ip) == blocked:
                return False
    except ValueError:
        if hostname in ["localhost", "127.0.0.1"]:
            return False
    return True

3. Autenticación y Autorización
3.1 Flujo JWT
plain
Copy

Cliente → POST /auth/login (email, password)
Servidor → Valida bcrypt → Genera access_token (30min) + refresh_token (7d)
Cliente → Guarda en localStorage (access) + httpOnly cookie (refresh)
Cliente → Envía access_token en Header: Authorization: Bearer <token>
Servidor → Valida JWT en CADA request protegido

3.2 Implementación del Dependency
Python
Copy

# backend/app/api/deps.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(401, "Invalid token")
        if is_token_revoked(token, db):
            raise HTTPException(401, "Token revoked")
    except JWTError:
        raise HTTPException(401, "Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")
    return user

async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    if not current_user.is_admin:
        log_security_event(
            "ADMIN_ACCESS_DENIED", 
            current_user.id, 
            "...", 
            {"route": "admin"}, 
            "warning"
        )
        raise HTTPException(403, "Admin access required")
    return current_user

async def get_admin_via_any_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    api_key: str = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db)
) -> User:
    # 1. Intentar JWT
    if credentials:
        try:
            user = await get_current_user(credentials, db)
            if user.is_admin:
                return user
        except HTTPException:
            pass

    # 2. Intentar API Key
    if api_key:
        key_hash = hash_api_key(api_key)
        api_key_record = db.query(ApiKey).filter(
            ApiKey.key_hash == key_hash,
            ApiKey.is_active == True,
            (ApiKey.expires_at == None) | 
            (ApiKey.expires_at > datetime.utcnow())
        ).first()

        if api_key_record:
            user = db.query(User).filter(
                User.id == api_key_record.user_id
            ).first()
            if user and user.is_admin:
                api_key_record.last_used_at = datetime.utcnow()
                db.commit()
                return user

    raise HTTPException(401, "Valid admin authentication required")

3.3 Refresh Token Flow
Python
Copy

# backend/app/api/auth.py
@router.post("/auth/refresh")
async def refresh_token(
    refresh_token: str, 
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(
            refresh_token, 
            REFRESH_SECRET_KEY, 
            algorithms=[ALGORITHM]
        )
        user_id = payload.get("sub")
        token_type = payload.get("type")

        if token_type != "refresh":
            raise HTTPException(401, "Invalid token type")

        if is_token_revoked(refresh_token, db):
            raise HTTPException(401, "Token revoked")

        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_active:
            raise HTTPException(401, "User not found")

        new_access = create_access_token(user.id)
        return {"access_token": new_access, "token_type": "bearer"}

    except JWTError:
        raise HTTPException(401, "Invalid refresh token")

3.4 Logout y Revocación
Python
Copy

# backend/app/models/revoked_token.py
class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    token_jti = Column(String(255), unique=True, index=True)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

async def is_token_revoked(token: str, db: Session) -> bool:
    try:
        payload = jwt.get_unverified_claims(token)
        jti = payload.get("jti")
        if not jti:
            return True
        exists = db.query(RevokedToken).filter(
            RevokedToken.token_jti == jti
        ).first()
        return exists is not None
    except:
        return True

4. Validación y Sanitización de Datos
4.1 Pydantic Schemas con Protección Total
Python
Copy

# backend/app/schemas/user.py
from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional
import re

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)

    @validator("password")
    def validate_password(cls, v):
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @validator("first_name", "last_name")
    def sanitize_names(cls, v):
        v = re.sub(r"[<>\"'&]", "", v)
        return v.strip()

    @validator("phone")
    def validate_phone(cls, v):
        if v and not re.match(r"^[\+\d\s\-\(\)]{7,20}$", v):
            raise ValueError("Invalid phone number format")
        return v

class UserUpdate(BaseModel):
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=500)

    class Config:
        extra = "forbid"

4.2 Sanitización de HTML/Rich Text
Python
Copy

# backend/app/utils/sanitize.py
import bleach

ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "ul", "ol", "li"]
ALLOWED_ATTRIBUTES = {}

def sanitize_html(text: str) -> str:
    return bleach.clean(
        text, 
        tags=ALLOWED_TAGS, 
        attributes=ALLOWED_ATTRIBUTES, 
        strip=True
    )

5. Seguridad de WebSocket
5.1 Autenticación en WS
Python
Copy

# backend/app/websocket/manager.py
from fastapi import WebSocket, WebSocketDisconnect, HTTPException
from jose import JWTError, jwt

class SecureWSManager:
    async def connect(self, websocket: WebSocket, token: str, db: Session):
        try:
            payload = jwt.decode(
                token, SECRET_KEY, algorithms=[ALGORITHM]
            )
            user_id = payload.get("sub")
            if not user_id:
                await websocket.close(code=4001, reason="Invalid token")
                return None

            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.is_active:
                await websocket.close(code=4001, reason="User inactive")
                return None

        except JWTError:
            await websocket.close(code=4001, reason="Invalid token")
            return None

        await websocket.accept()
        self.active_connections[user_id] = {
            "websocket": websocket,
            "subscribed_threads": set(),
            "subscribed_tickets": set(),
            "last_ping": datetime.utcnow()
        }
        return user

    async def handle_message(self, user_id: str, data: dict):
        action = data.get("action")

        if action == "subscribe_thread":
            thread_id = data.get("thread_id")
            if await self._can_access_thread(user_id, thread_id):
                self.active_connections[user_id][
                    "subscribed_threads"
                ].add(thread_id)
            else:
                await self.send_to_user(user_id, {
                    "type": "error", 
                    "message": "Access denied to thread"
                })

        elif action == "ping":
            self.active_connections[user_id]["last_ping"] = datetime.utcnow()
            await self.send_to_user(user_id, {"type": "pong"})

5.2 Heartbeat y Timeout
Python
Copy

# En background task
async def ws_heartbeat_checker():
    while True:
        await asyncio.sleep(30)
        now = datetime.utcnow()
        for user_id, conn in list(ws_manager.active_connections.items()):
            if (now - conn["last_ping"]).seconds > 120:
                await conn["websocket"].close(
                    code=4002, reason="Heartbeat timeout"
                )
                ws_manager.disconnect(user_id)

6. Seguridad de Archivos y Uploads
6.1 Política de Uploads
Python
Copy

# backend/app/utils/upload.py
import magic
from pathlib import Path
import uuid

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "application/pdf": [".pdf"],
    "text/plain": [".txt"],
}

async def validate_upload(file: UploadFile):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large (max 10MB)")

    mime = magic.from_buffer(content, mime=True)
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(415, f"File type not allowed: {mime}")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_MIME_TYPES[mime]:
        raise HTTPException(415, "File extension does not match content")

    if file.filename.count(".") > 1:
        parts = file.filename.split(".")
        if parts[-1].lower() not in ["jpg", "jpeg", "png", "webp", "pdf", "txt"]:
            raise HTTPException(415, "Invalid file name")

    safe_name = f"{uuid.uuid4()}{ext}"
    return content, safe_name, mime

6.2 ImgBB + Fallback
Python
Copy

async def upload_file(file: UploadFile, folder: str = "uploads") -> str:
    content, safe_name, mime = await validate_upload(file)

    try:
        url = await upload_to_imgbb(content, safe_name)
        return url
    except Exception as e:
        logger.warning(f"ImgBB upload failed: {e}")

    upload_dir = Path(f"/app/{folder}")
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / safe_name

    with open(file_path, "wb") as f:
        f.write(content)

    return f"/static/{folder}/{safe_name}"

7. Seguridad de Base de Datos
7.1 Conexión Segura
Python
Copy

# backend/app/core/database.py
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={
        "sslmode": "require",
        "connect_timeout": 10,
    }
)

7.2 Migraciones Idempotentes
sql
Copy

-- alembic/versions/xxx_initial.sql
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ...
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = "account_type"
    ) THEN
        CREATE TYPE account_type AS ENUM ("empresa", "particular");
    END IF;
END
$$;

7.3 Backup y Encriptación

    Backups automáticos diarios en Neon (ya incluido)
    Para PII crítica: considerar encriptación a nivel de columna con pgcrypto
    Nunca hacer SELECT * en logs o respuestas JSON

8. Seguridad de Infraestructura
8.1 Railway (Backend)

    Region: us-west (para LATAM)
    Variables de entorno: marcar como "Secret" en Railway dashboard
    Health check endpoint: GET /health
    No exponer puertos internos (solo 8000/80)

8.2 Vercel (Frontend)

    Environment: Production
    Headers de seguridad en vercel.json:

JSON
Copy

{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://i.ibb.co data: blob:; connect-src 'self' wss: https://api.tundraconnection.com;"
        }
      ]
    }
  ]
}

8.3 Neon (PostgreSQL)

    SSL obligatorio
    IP Allowlist (si Neon lo soporta en el plan)
    Usar rol con mínimos privilegios (no superuser)
    Rotar password cada 90 días

9. Seguridad de Grafana y Monitoreo
9.1 Principios

    Nunca exponer Grafana directamente a internet
    Usar proxy en FastAPI con autenticación JWT
    Service Account con rol mínimo (Viewer)
    Validar todas las URLs antes de hacer requests
    No permitir variables arbitrarias en embeds

9.2 Configuración Grafana
ini
Copy

# grafana.ini
[security]
allow_embedding = true
cookie_samesite = strict
strict_transport_security = true
strict_transport_security_max_age_seconds = 31536000
content_security_policy = true

[auth]
disable_login_form = false
disable_signout_menu = false

[auth.anonymous]
enabled = false

9.3 Proxy Seguro en FastAPI
Python
Copy

@router.get("/admin/grafana/embed/{dashboard_uid}")
async def get_grafana_embed(
    dashboard_uid: str,
    from_time: str = Query("now-6h"),
    to_time: str = Query("now"),
    current_user: User = Depends(get_current_admin)
):
    dashboard = db.query(GrafanaDashboard).filter(
        GrafanaDashboard.uid == dashboard_uid,
        GrafanaDashboard.is_active == True
    ).first()

    if not dashboard:
        raise HTTPException(404)

    embed_url = f"{GRAFANA_URL}/d/{dashboard_uid}"
    params = {
        "orgId": 1,
        "from": from_time,
        "to": to_time,
        "theme": "dark",
        "kiosk": "true",
    }

    for var_name, var_value in dashboard.variables.items():
        params[f"var-{var_name}"] = var_value

    url = f"{embed_url}?{urlencode(params)}"
    return {"embed_url": url, "name": dashboard.name}

10. Headers HTTP y Configuración CORS
10.1 Headers Obligatorios (Nginx)
nginx
Copy

# nginx.conf
server {
    listen 80;
    server_name api.tundraconnection.com;

    location / {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Strict-Transport-Security 
            "max-age=31536000; includeSubDomains" always;
        add_header Referrer-Policy 
            "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy 
            "geolocation=(), microphone=(), camera=()" always;

        limit_req zone=api_limit burst=20 nodelay;
    }
}

10.2 CORS Estricto
Python
Copy

origins = [
    os.getenv("FRONTEND_URL", "https://tundraconnection.com"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=[
        "Authorization", "Content-Type", 
        "X-API-Key", "X-Request-ID"
    ],
    expose_headers=["X-Request-ID"],
    max_age=600,
)

11. Rate Limiting y Protección Anti-DoS
11.1 Implementación con slowapi
Python
Copy

# backend/app/core/limiter.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# En main.py
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

# En routers
@router.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, ...):
    ...

@router.post("/auth/register")
@limiter.limit("3/hour")
async def register(request: Request, ...):
    ...

@router.get("/catalog")
@limiter.limit("100/minute")
async def get_catalog(request: Request, ...):
    ...

MAX_WS_PER_IP = 5

11.2 Límites por Endpoint
Table
Endpoint	Límite	Ventana
POST /auth/login	5	15 minutos
POST /auth/register	3	1 hora
POST /auth/password	3	1 hora
POST /invoices/checkout	10	1 hora
POST /support-tickets	20	1 hora
POST /chat-quotations/threads	10	1 hora
WS /ws	5 conexiones	Por IP
GET /catalog	100	1 minuto
GET /services	100	1 minuto
Admin endpoints	200	1 minuto
12. Manejo de Secretos y Variables de Entorno
12.1 Reglas de Oro

    NUNCA commitear .env al repositorio
    NUNCA loggear secretos (incluso en debug)
    NUNCA enviar secrets al frontend
    Rotar secrets cada 90 días
    Usar diferentes secrets para dev/staging/prod

12.2 .env.example
bash
Copy

# Backend
DATABASE_URL=postgresql://user:pass@localhost/db?sslmode=require
SECRET_KEY=change-me-64-chars-minimum
REFRESH_SECRET_KEY=change-me-too-64-chars
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback

# ImgBB
IMGBB_API_KEY=your-imgbb-key

# Grafana
GRAFANA_URL=https://your-grafana.com
GRAFANA_SERVICE_ACCOUNT_TOKEN=glsa_xxx

# Email
RESEND_API_KEY=re_xxx
EMAIL_FROM=noreply@tundraconnection.com

# Frontend
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws

12.3 Validación de Secrets al Startup
Python
Copy

# backend/app/core/config.py
from pydantic_settings import BaseSettings
from pydantic import validator

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    REFRESH_SECRET_KEY: str
    ENVIRONMENT: str = "development"

    @validator("SECRET_KEY", "REFRESH_SECRET_KEY")
    def validate_secret_length(cls, v):
        if len(v) < 32:
            raise ValueError("Secret keys must be at least 32 characters")
        return v

    @validator("DATABASE_URL")
    def validate_database_url(cls, v):
        if "sslmode=require" not in v and "ENVIRONMENT" == "production":
            raise ValueError(
                "Production DATABASE_URL must include sslmode=require"
            )
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

13. Logging y Auditoría de Seguridad
13.1 Eventos que DEBEN loggearse
Table
Evento	Nivel	Datos a loggear
Login exitoso	INFO	user_id, ip, user_agent, timestamp
Login fallido	WARNING	email, ip, user_agent, reason
Logout	INFO	user_id, ip
Password changed	INFO	user_id, ip
API Key creada	INFO	user_id, key_name, ip
API Key usada	INFO	user_id, key_id, endpoint, ip
Admin access	INFO	user_id, endpoint, ip
IDOR attempt	WARNING	user_id, target_resource, ip
Rate limit hit	WARNING	ip, endpoint
File upload	INFO	user_id, filename, size, mime
Invoice created	INFO	user_id, invoice_id, amount
Ticket status changed	INFO	ticket_id, old_status, new_status, user_id
WS connection	INFO	user_id, ip
WS auth failure	WARNING	ip, reason
13.2 Formato de Logs
JSON
Copy

{
  "timestamp": "2026-04-27T18:25:00Z",
  "level": "WARNING",
  "event": "LOGIN_FAILED",
  "user_id": null,
  "ip": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "details": {
    "email": "user@example.com",
    "reason": "invalid_password",
    "attempt_number": 3
  },
  "request_id": "req_abc123"
}

13.3 Configuración de Logging
Python
Copy

# backend/app/core/logging_config.py
import logging
from pythonjsonlogger import jsonlogger

class SecurityFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        log_record["timestamp"] = datetime.utcnow().isoformat()
        log_record["level"] = record.levelname

security_handler = logging.StreamHandler()
security_handler.setFormatter(SecurityFormatter())

security_logger = logging.getLogger("security")
security_logger.setLevel(logging.INFO)
security_logger.addHandler(security_handler)

14. Incident Response Básico
14.1 Playbook: Credenciales Comprometidas

    Detectar: Múltiples logins desde IPs sospechosas
    Contener: Revocar TODOS los tokens del usuario (blacklist)
    Erradicar: Forzar cambio de password en próximo login
    Recuperar: Notificar al usuario vía email
    Lecciones: Revisar logs de los últimos 7 días

14.2 Playbook: API Key Exposed

    Detectar: Key usada desde IP no reconocida o publicada en GitHub
    Contener: Revocar key inmediatamente (is_active = False)
    Erradicar: Generar nueva key
    Recuperar: Notificar al admin
    Lecciones: Revisar si hubo acceso no autorizado a datos

14.3 Playbook: XSS Detectado

    Detectar: Script en mensaje de chat o ticket
    Contener: Desactivar el recurso (mensaje/ticket)
    Erradicar: Sanitizar contenido, patch en validación
    Recuperar: Revisar si otros usuarios fueron afectados
    Lecciones: Implementar CSP más estricto

15. Checklist Pre-Deploy de Seguridad
15.1 Backend

    [ ] SECRET_KEY tiene 64+ caracteres aleatorios
    [ ] REFRESH_SECRET_KEY es diferente de SECRET_KEY
    [ ] ENVIRONMENT=production en variables
    [ ] DATABASE_URL incluye sslmode=require
    [ ] Docs/Redoc/OpenAPI desactivados (docs_url=None)
    [ ] CORS con allow_origins explícito (no *)
    [ ] Rate limiting activo en todos los endpoints auth
    [ ] Todos los endpoints protegidos verifican ownership (IDOR)
    [ ] File upload valida MIME type, tamaño y extensión
    [ ] SQLAlchemy ORM usado en TODAS las queries
    [ ] Pydantic extra="forbid" en todos los schemas de entrada
    [ ] Password policy enforceada
    [ ] JWT tokens tienen jti claim para revocación
    [ ] Logs de seguridad configurados
    [ ] Health check endpoint funcional
    [ ] Dependencias escaneadas (pip-audit)
    [ ] No hay prints o logs de datos sensibles
    [ ] API Keys usan SHA-256, nunca texto plano
    [ ] Grafana proxy valida URLs (anti-SSRF)

15.2 Frontend

    [ ] No hay API keys o secrets en el código
    [ ] Axios interceptor maneja 401/403 correctamente
    [ ] No se usa dangerouslySetInnerHTML sin sanitización
    [ ] WebSocket reconecta con backoff exponencial
    [ ] JWT se almacena de forma segura
    [ ] Formularios validan inputs antes de enviar
    [ ] CSP headers configurados en Vercel
    [ ] No hay comentarios con información sensible

15.3 Infraestructura

    [ ] Railway en us-west
    [ ] Neon con SSL obligatorio
    [ ] Dominio con HTTPS
    [ ] Redirect 308 de HTTP a HTTPS
    [ ] Nginx con headers de seguridad
    [ ] Variables de entorno marcadas como secret en Railway
    [ ] Backup automático configurado en Neon
    [ ] Monitor de uptime activo

📎 APÉNDICE: Referencias Rápidas
Códigos HTTP de Error de Seguridad
Table
Código	Uso
400	Datos de entrada inválidos
401	No autenticado / Token inválido
403	Autenticado pero sin permisos
404	Recurso no existe (usar también para recursos que existen pero no pertenecen al usuario)
413	Archivo demasiado grande
415	Tipo de archivo no permitido
429	Rate limit excedido
500	Error interno (NUNCA exponer detalles al cliente)
WebSocket Close Codes
Table
Código	Razón
4001	Autenticación fallida
4002	Heartbeat timeout
4003	No autorizado para este recurso
4004	Recurso no encontrado
4005	Rate limit de conexiones
1011	Error interno del servidor

    Última actualización: 2026-04-27
    Nota: Este documento es un contrato de seguridad. Cualquier modificación debe ser revisada y aprobada. La seguridad es responsabilidad de TODOS los desarrolladores, no solo del "equipo de seguridad".