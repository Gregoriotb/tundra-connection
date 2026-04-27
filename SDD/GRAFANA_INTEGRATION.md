10.1 Arquitectura de Integración
plain
Copy

Tundra Admin Panel ←→ FastAPI Proxy ←→ Grafana API ←→ UISP (Ubiquiti) / Prometheus
                     ↑
              Service Account Auth
              (Token o Basic Auth)

10.2 Configuración en Grafana

    Crear Service Account en Grafana:
        Admin → Service Accounts → New
        Rol: Viewer (solo lectura para embeds)
        Generar token
    Configurar Datasource:
        Tipo: Prometheus o InfluxDB
        URL: Endpoint de UISP/métricas
        Auth: Basic o Token según corresponda
    Crear Dashboards:
        Panel: Tráfico por antena
        Panel: Latencia por cliente
        Panel: Estado de nodos
        Variables: node, client, time_range

10.3 Endpoints FastAPI
Proxy Seguro
Python
Copy

@router.get("/admin/grafana/proxy/{uid}")
async def proxy_grafana_dashboard(
    uid: str,
    from_time: str = Query(...),
    to_time: str = Query(...),
    var_node: str = Query(None),
    current_user: User = Depends(get_admin_user)
):
    # 1. Verificar que el dashboard existe en DB local
    # 2. Construir URL de embed con variables
    # 3. Hacer request a Grafana API con service account token
    # 4. Retornar HTML embed o redirigir

Embed URL
Python
Copy

def build_embed_url(dashboard_uid: str, variables: dict) -> str:
    base = f"{GRAFANA_URL}/d/{dashboard_uid}"
    params = {
        "orgId": 1,
        "from": variables.get("from"),
        "to": variables.get("to"),
        "theme": "dark",
        "kiosk": "true"  # Sin menús de Grafana
    }
    # Añadir variables custom
    for k, v in variables.items():
        if k not in ["from", "to"]:
            params[f"var-{k}"] = v
    return f"{base}?{urlencode(params)}"

10.4 Vista en React
tsx
Copy

// components/admin/MonitoringView.tsx
const MonitoringView = () => {
  const [dashboards, setDashboards] = useState<GrafanaDashboard[]>([]);
  
  return (
    <div className="space-y-6">
      {dashboards.map(d => (
        <div key={d.id} className="glass-card border border-gold-tundra/20 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="font-power text-lg text-gold-tundra">{d.name}</h3>
          </div>
          <iframe
            src={d.embed_url}
            width="100%"
            height="400"
            frameBorder="0"
            className="bg-black"
          />
        </div>
      ))}
    </div>
  );
};

10.5 Seguridad del Embed

    Nunca exponer token de Grafana al frontend
    Usar proxy en FastAPI que agrega el auth header
    O usar signed URLs si Grafana lo soporta
    kiosk=true para ocultar UI de Grafana
    theme=dark para coincidir con diseño Tundra

10.6 Variables Comunes UISP
Table
Variable	Descripción	Ejemplo
node	Nodo/antena	tower_norte_01
client	Cliente específico	cliente_123
interface	Interfaz de red	eth0, wlan0
time_range	Rango de tiempo	now-6h, now-24h