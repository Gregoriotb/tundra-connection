🔐 VARIABLES DE ENTORNO (Plantilla .env)
bash
Copy

# Backend
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
SECRET_KEY=tu-clave-super-segura-de-minimo-64-caracteres-aqui
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback

# ImgBB
IMGBB_API_KEY=tu-api-key-de-imgbb

# Grafana
GRAFANA_URL=https://tu-grafana.com
GRAFANA_SERVICE_ACCOUNT_TOKEN=glsa_xxx

# Email (Resend)
RESEND_API_KEY=re_xxx
EMAIL_FROM=noreply@tundraconnection.com

# Frontend
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws