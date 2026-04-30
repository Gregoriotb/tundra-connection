/**
 * MyServicesTab — servicios de internet contratados por el cliente.
 *
 * Spec:
 * - El cliente ve los servicios que ha contratado (facturas con
 *   tipo=INTERNET_SERVICE). Cada uno tiene plan, dirección de
 *   instalación y estado.
 * - Reusa `invoicesApi.myInvoices()` filtrando por tipo en cliente.
 * - Estado de instalación se infiere del estado de la factura:
 *     pending  → "Pendiente de instalación"
 *     paid     → "Activo"
 *     cancelled → "Cancelado"
 *     overdue  → "Pago vencido"
 *     refunded → "Reembolsado"
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  Wifi,
  X,
} from 'lucide-react';

import { invoicesApi, type Invoice } from '../../services/api';

type ServiceStatus = 'active' | 'pending' | 'overdue' | 'cancelled' | 'refunded';

const STATUS_LABEL: Record<ServiceStatus, string> = {
  active: 'Activo',
  pending: 'Pendiente de instalación',
  overdue: 'Pago vencido',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

const STATUS_TONE: Record<ServiceStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  pending: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  overdue: 'bg-red-500/10 text-red-300 border-red-500/30',
  cancelled: 'bg-white/5 text-white/40 border-white/10',
  refunded: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
};

function statusFromInvoice(estado: Invoice['estado']): ServiceStatus {
  switch (estado) {
    case 'paid':
      return 'active';
    case 'pending':
      return 'pending';
    case 'overdue':
      return 'overdue';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
  }
}

export function MyServicesTab(): JSX.Element {
  const [services, setServices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoicesApi.myInvoices();
      // Filtrar solo servicios de internet — el cliente puede tener
      // también facturas de productos del catálogo.
      setServices(res.items.filter((inv) => inv.tipo === 'INTERNET_SERVICE'));
    } catch (err) {
      const e = err as { detail?: string; message?: string };
      setError(e.detail ?? e.message ?? 'Error cargando servicios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const stats = useMemo(() => {
    if (!services) return null;
    return {
      total: services.length,
      active: services.filter((s) => s.estado === 'paid').length,
      pending: services.filter((s) => s.estado === 'pending').length,
    };
  }, [services]);

  return (
    <section className="flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-tundra-gold flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            Mis servicios de internet
          </h2>
          <p className="text-xs uppercase tracking-wider text-white/40">
            {services === null ? '…' : `${services.length} servicios contratados`}
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

      {/* ── Stats summary ────────────────────────────────────────────── */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatBox
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="Activos"
            value={stats.active}
            tone="good"
          />
          <StatBox
            icon={<Clock className="w-4 h-4" />}
            label="Pendientes"
            value={stats.pending}
            tone={stats.pending > 0 ? 'warn' : 'neutral'}
          />
          <StatBox
            icon={<Wifi className="w-4 h-4" />}
            label="Total"
            value={stats.total}
            tone="neutral"
          />
        </div>
      )}

      {/* ── Lista ────────────────────────────────────────────────────── */}
      {services === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-lg border border-tundra-border bg-white/[0.02] animate-pulse"
            />
          ))}
        </div>
      ) : services.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((s) => (
            <ServiceCard key={s.id} invoice={s} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────

function ServiceCard({ invoice }: { invoice: Invoice }): JSX.Element {
  const status = statusFromInvoice(invoice.estado);
  const plan = invoice.plan_seleccionado as Record<string, unknown> | null;
  const planName =
    (plan?.name as string) || (plan?.nombre as string) || 'Plan no especificado';
  const planSpeed =
    (plan?.speed as string) ||
    (plan?.velocidad as string) ||
    (plan?.bandwidth as string) ||
    null;

  const StatusIcon = (() => {
    if (status === 'active') return CheckCircle2;
    if (status === 'pending') return Clock;
    if (status === 'overdue') return AlertTriangle;
    return X;
  })();

  return (
    <article className="rounded-lg border border-tundra-border bg-white/[0.02] p-5 flex flex-col gap-4 hover:border-tundra-gold/40 transition-colors">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg text-white">{planName}</div>
          {planSpeed && (
            <div className="text-xs uppercase tracking-wider text-tundra-gold mt-0.5">
              {planSpeed}
            </div>
          )}
        </div>
        <span
          className={[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] uppercase tracking-wider border',
            STATUS_TONE[status],
          ].join(' ')}
        >
          <StatusIcon className="w-3 h-3" />
          {STATUS_LABEL[status]}
        </span>
      </header>

      {invoice.direccion_instalacion && (
        <div className="flex items-start gap-2 text-sm text-white/60">
          <MapPin className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{invoice.direccion_instalacion}</span>
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-tundra-border pt-3 text-xs">
        <span className="text-white/40 uppercase tracking-wider">
          Mensual: <span className="text-tundra-gold">${invoice.total}</span>
        </span>
        <span className="text-white/30 uppercase tracking-wider">
          Desde {new Date(invoice.created_at).toLocaleDateString()}
        </span>
      </footer>
    </article>
  );
}

interface StatBoxProps {
  icon: JSX.Element;
  label: string;
  value: number;
  tone: 'neutral' | 'good' | 'warn';
}

function StatBox({ icon, label, value, tone }: StatBoxProps): JSX.Element {
  const toneClass: Record<StatBoxProps['tone'], string> = {
    neutral: 'border-tundra-border text-white',
    good: 'border-emerald-500/30 text-emerald-300',
    warn: 'border-yellow-500/30 text-yellow-300',
  };
  return (
    <div
      className={[
        'rounded-md border bg-white/[0.02] px-4 py-3 flex items-center justify-between',
        toneClass[tone],
      ].join(' ')}
    >
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          {label}
        </span>
        <span className="font-display text-2xl">{value}</span>
      </div>
      <span className="opacity-60">{icon}</span>
    </div>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-tundra-border bg-white/[0.01] px-6 py-12 flex flex-col items-center gap-3 text-center">
      <Wifi className="w-10 h-10 text-white/20" />
      <h3 className="font-display text-lg text-white/60">
        Aún no tienes servicios contratados
      </h3>
      <p className="text-xs text-white/40 max-w-md">
        Explora nuestros servicios de internet en el landing, elige un plan y
        completa la solicitud. Una vez aprobada tu factura, el servicio
        aparecerá aquí.
      </p>
      <a
        href="#"
        className="mt-2 px-4 py-2 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300"
      >
        Ver servicios disponibles
      </a>
    </div>
  );
}
