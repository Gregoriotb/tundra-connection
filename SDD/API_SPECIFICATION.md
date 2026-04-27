4.1 Auth Endpoints
Table
Método	Endpoint	Auth	Descripción
POST	/auth/register	Público	Registro email/password
POST	/auth/login	Público	Login email/password → JWT
GET	/auth/google/login	Público	Inicia OAuth Google
GET	/auth/google/callback	Público	Callback OAuth
GET	/auth/verify	JWT	Verifica token, retorna user + has_password
POST	/auth/password	JWT	Set/change password
4.2 User Endpoints
Table
Método	Endpoint	Auth	Descripción
GET	/users/profile	JWT	Perfil completo
PUT	/users/profile	JWT	Actualizar perfil
POST	/users/profile/photo-upload	JWT	Subir foto de perfil
POST	/users/profile/rif-upload	JWT	Subir documento RIF
4.3 Catalog Endpoints
Table
Método	Endpoint	Auth	Descripción
GET	/catalog	Público	Listar items activos
GET	/catalog/{id}	Público	Detalle item
POST	/admin/catalog	Admin	Crear item
PUT	/admin/catalog/{id}	Admin	Actualizar item
DELETE	/admin/catalog/{id}	Admin	Desactivar item (soft delete)
4.4 Services Endpoints
Table
Método	Endpoint	Auth	Descripción
GET	/services	Público	Listar 3 servicios con planes
GET	/services/{slug}	Público	Detalle de servicio + planes
4.5 Invoices Endpoints
Table
Método	Endpoint	Auth	Descripción
POST	/invoices/checkout	JWT	Crear factura (productos o internet)
GET	/invoices/my-invoices	JWT	Listar facturas del usuario
GET	/invoices/{id}	JWT	Detalle de factura
GET	/admin/invoices	Admin	Listar todas las facturas
PATCH	/admin/invoices/{id}/status	Admin	Cambiar estado de factura
Request POST /invoices/checkout (Internet Service):
JSON
Copy

{
  "tipo": "INTERNET_SERVICE",
  "service_id": "uuid-del-servicio",
  "plan_id": "fibra_100mb",
  "direccion_instalacion": "Av. Principal, Edif. Torre A, Piso 3, Oficina 301",
  "notas": "Instalación preferible en horario matutino"
}

4.6 Chat-Cotizaciones Endpoints
Table
Método	Endpoint	Auth	Descripción
POST	/chat-quotations/threads	JWT	Crear hilo de cotización (servicios extras)
GET	/chat-quotations/my-threads	JWT	Listar mis hilos
GET	/chat-quotations/threads/{id}	JWT	Detalle + mensajes
POST	/chat-quotations/threads/{id}/messages	JWT	Enviar mensaje
POST	/chat-quotations/threads/{id}/attachments	JWT	Subir adjunto
GET	/admin/threads	Admin	Listar todos los hilos
PATCH	/admin/threads/{id}/status	Admin	Cambiar estado del hilo
Request POST /chat-quotations/threads:
JSON
Copy

{
  "service_id": "uuid-servicios-extras",
  "requerimiento_inicial": "Necesito instalar 8 cámaras en un almacén de 500m²",
  "direccion": "Zona Industrial Norte, Galpón 45",
  "presupuesto_estimado": 2500.00
}

4.7 Support Tickets Endpoints (Reportes de Fallas)
Table
Método	Endpoint	Auth	Descripción
POST	/support-tickets	JWT	Crear ticket
GET	/support-tickets/my-tickets	JWT	Listar mis tickets
GET	/support-tickets/{id}	JWT	Detalle + historial
POST	/support-tickets/{id}/attachments	JWT	Adjuntar archivo
GET	/admin/support-tickets	Admin	Listar todos (con filtros)
GET	/admin/support-tickets/{id}	Admin	Detalle completo (incl. notas internas)
PATCH	/admin/support-tickets/{id}/status	Admin	Cambiar estado
PATCH	/admin/support-tickets/{id}/assign	Admin	Asignar a técnico
POST	/admin/support-tickets/{id}/internal-note	Admin	Agregar nota interna
POST	/support-tickets/{id}/reply	JWT/Admin	Responder (visible al cliente)
Request POST /support-tickets:
JSON
Copy

{
  "tipo": "incidencia",
  "servicio_relacionado": "fibra_optica",
  "titulo": "Intermitencia en servicio de 100Mbps",
  "descripcion": "Desde ayer en horas de la tarde el servicio presenta caídas cada 15 minutos aproximadamente.",
  "prioridad": "alta"
}

Request PATCH /admin/support-tickets/{id}/status:
JSON
Copy

{
  "estado": "en_proceso",
  "nota": "Se detectó falla en el OLT. Técnico en camino."
}

4.8 Notifications Endpoints
Table
Método	Endpoint	Auth	Descripción
GET	/notifications	JWT	Listar notificaciones
GET	/notifications/unread-count	JWT	Contador no leídas
PUT	/notifications/{id}/read	JWT	Marcar como leída
PUT	/notifications/mark-all-read	JWT	Marcar todas como leídas
DELETE	/notifications/{id}	JWT	Eliminar notificación
4.9 Admin Export + API Keys
Table
Método	Endpoint	Auth	Descripción
GET	/admin/export-all	Admin/API-Key	Export JSON unificado
POST	/admin/api-keys	Admin	Crear API key (raw UNA VEZ)
GET	/admin/api-keys	Admin	Listar keys
DELETE	/admin/api-keys/{id}	Admin	Revocar key
4.10 Grafana Endpoints
Table
Método	Endpoint	Auth	Descripción
GET	/admin/grafana/dashboards	Admin	Listar dashboards configurados
POST	/admin/grafana/dashboards	Admin	Registrar dashboard
GET	/admin/grafana/dashboards/{id}/embed	Admin	URL embed con variables
GET	/admin/grafana/proxy/{uid}	Admin	Proxy a Grafana API
4.11 WebSocket Protocol
Conexión: wss://api.tundra.com/ws?token=<JWT>
Mensajes Cliente → Servidor:
JSON
Copy

{"action": "ping"}
{"action": "subscribe_thread", "thread_id": "uuid"}
{"action": "unsubscribe_thread", "thread_id": "uuid"}
{"action": "subscribe_ticket", "ticket_id": "uuid"}
{"action": "unsubscribe_ticket", "ticket_id": "uuid"}

Mensajes Servidor → Cliente:
JSON
Copy

{"type": "pong"}
{"type": "notification", "payload": {...}}
{"type": "chat_message", "payload": {"thread_id": "...", "message": {...}}}
{"type": "thread_updated", "payload": {"thread_id": "...", "status": "..."}}
{"type": "ticket_updated", "payload": {"ticket_id": "...", "status": "...", "assigned_to": "..."}}

