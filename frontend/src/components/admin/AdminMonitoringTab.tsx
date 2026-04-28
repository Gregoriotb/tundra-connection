/**
 * AdminMonitoringTab — placeholder de monitoreo (FASE 8, archivo 11/12).
 *
 * Spec:
 * - Orquestor.md §FASE 8 + §FASE 9 (Grafana real)
 * - En FASE 8 mostramos snapshot agregado vía GET /admin/export-all.
 *   La integración con Grafana embebido (panel /d/...) llega en FASE 9
 *   junto con Loki + Prometheus exporter.
 *
 * En este punto el tab cumple dos funciones:
 *  1. Mostrar el snapshot rápido (counts + KPIs operativos) — ya útil.
 *  2. Reservar el espacio donde se montará el iframe de Grafana cuando
 *     llegue la fase 9 (TODO marcado abajo).
 */

import { useEffect, useState } from 'react';
import { Activity, Database, RefreshCw } from 'lucide-react';

import { adminApi, type AdminExportAll } from '../../services/api';
import { MonitoringView } from '../MonitoringView';

const COUNT_LABELS: Record<string, string> = {
  users: 'Usuarios',
  catalog_items: 'Items de catálogo',
  services: 'Servicios',
  invoices: 'Facturas',
  quotation_threads: 'Hilos de cotización',
  support_tickets: 'Tickets',
  notifications: 'Notificaciones',
  api_keys: 'API Keys',
};

export function AdminMonitoringTab(): JSX.Element {
  const [snapshot, setSnapshot] = useState<AdminExportAll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.exportAll();
      setSnapshot(res);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error cargando snapshot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-tundra-gold flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Monitoreo
          </h2>
          <p className="text-xs uppercase tracking-wider text-white/40">
            Snapshot agregado del sistema
            {snapshot && ` · ${new Date(snapshot.generated_at).toLocaleString()}`}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wider text-white/60 border border-tundra-border rounded-md hover:text-white hover:border-white/30 disabled:opacity-50"
        >
          <RefreshCw
            className={['w-3.5 h-3.5', loading ? 'animate-spin' : ''].join(' ')}
          />
          Refrescar
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── KPIs operativos ──────────────────────────────────────────── */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-white/40 mb-3">
          KPIs operativos
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiBox
            label="Total facturado"
            value={
              snapshot
                ? `$${Number(snapshot.invoices_total_amount).toFixed(2)}`
                : '—'
            }
            tone="good"
          />
          <KpiBox
            label="Tickets abiertos"
            value={snapshot?.open_tickets ?? '—'}
            tone={
              snapshot && snapshot.open_tickets > 5 ? 'warn' : 'neutral'
            }
          />
          <KpiBox
            label="Cotizaciones pendientes"
            value={snapshot?.pending_quotations ?? '—'}
            tone="neutral"
          />
          <KpiBox
            label="API Keys activas"
            value={snapshot?.active_api_keys ?? '—'}
            tone="neutral"
          />
        </div>
      </div>

      {/* ── Counts por entidad ───────────────────────────────────────── */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-white/40 mb-3 flex items-center gap-2">
          <Database className="w-3.5 h-3.5" />
          Conteo por entidad
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {snapshot === null ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-md border border-tundra-border bg-white/[0.02] animate-pulse"
              />
            ))
          ) : (
            Object.entries(snapshot.counts).map(([key, val]) => (
              <div
                key={key}
                className="rounded-md border border-tundra-border bg-white/[0.02] px-4 py-3"
              >
                <div className="text-[10px] uppercase tracking-wider text-white/40">
                  {COUNT_LABELS[key] ?? key}
                </div>
                <div className="font-display text-2xl text-white mt-1">
                  {val}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Grafana dashboards (FASE 9) ──────────────────────────────── */}
      <MonitoringView />
    </section>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────

interface KpiBoxProps {
  label: string;
  value: string | number;
  tone: 'neutral' | 'good' | 'warn' | 'danger';
}

function KpiBox({ label, value, tone }: KpiBoxProps): JSX.Element {
  const toneClass: Record<KpiBoxProps['tone'], string> = {
    neutral: 'border-tundra-border text-white',
    good: 'border-emerald-500/40 text-emerald-300',
    warn: 'border-yellow-500/40 text-yellow-300',
    danger: 'border-red-500/40 text-red-300',
  };
  return (
    <div
      className={[
        'rounded-md border bg-white/[0.02] px-4 py-3',
        toneClass[tone],
      ].join(' ')}
    >
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  );
}
