/**
 * AdminPage — pantalla principal del panel admin (FASE 8).
 *
 * Spec:
 * - Orquestor.md §FASE 8 + mapa endpoints §Admin
 * - Protección de ruta: redirect si !user.is_admin (R4 — sin leak)
 * - 5 tabs lazy-loaded para no inflar bundle inicial
 * - KPI cards en el header (GET /admin/stats)
 *
 * Tabs:
 *   1. Cotizaciones → AdminQuotationsTab
 *   2. Catálogo    → AdminCatalogTab
 *   3. Facturas    → AdminInvoicesTab
 *   4. Soporte     → TicketKanban
 *   5. API Keys    → AdminApiKeysTab
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import {
  FileText,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  Package,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { adminApi, type AdminStats, type StatsCard } from '../services/api';

// Lazy-load de tabs — cada uno se descarga solo si el admin lo abre.
const AdminQuotationsTab = lazy(() =>
  import('../components/admin/AdminQuotationsTab').then((m) => ({
    default: m.AdminQuotationsTab,
  })),
);
const AdminCatalogTab = lazy(() =>
  import('../components/admin/AdminCatalogTab').then((m) => ({
    default: m.AdminCatalogTab,
  })),
);
const AdminInvoicesTab = lazy(() =>
  import('../components/admin/AdminInvoicesTab').then((m) => ({
    default: m.AdminInvoicesTab,
  })),
);
const AdminApiKeysTab = lazy(() =>
  import('../components/admin/AdminApiKeysTab').then((m) => ({
    default: m.AdminApiKeysTab,
  })),
);
// Soporte se cubre con TicketKanban del admin que ya existe.
const TicketKanban = lazy(() =>
  import('../components/admin/TicketKanban').then((m) => ({
    default: m.TicketKanban,
  })),
);

type TabKey =
  | 'quotations'
  | 'catalog'
  | 'invoices'
  | 'support'
  | 'api_keys';

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof FileText;
}

const TABS: TabDef[] = [
  { key: 'quotations', label: 'Cotizaciones', icon: MessagesSquare },
  { key: 'catalog', label: 'Catálogo', icon: Package },
  { key: 'invoices', label: 'Facturas', icon: FileText },
  { key: 'support', label: 'Soporte', icon: ShieldCheck },
  { key: 'api_keys', label: 'API Keys', icon: KeyRound },
];

interface AdminPageProps {
  onExit?: () => void;
}

export function AdminPage({ onExit }: AdminPageProps): JSX.Element {
  const { user, status } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('quotations');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !user?.is_admin) return;
    let cancelled = false;
    adminApi
      .stats()
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setStatsError(
            err?.response?.data?.detail ?? 'No se pudieron cargar los KPIs',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, user?.is_admin]);

  // Protección de ruta: 404-style (R4) — no leak de existencia.
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-tundra-bg flex items-center justify-center text-white/40 text-sm uppercase tracking-wider">
        Cargando…
      </div>
    );
  }
  if (status !== 'authenticated' || !user?.is_admin) {
    return (
      <div className="min-h-screen bg-tundra-bg flex flex-col items-center justify-center gap-6 text-center px-6">
        <div className="font-display text-4xl text-tundra-gold">404</div>
        <p className="text-white/50 text-sm uppercase tracking-wider max-w-md">
          La página solicitada no existe.
        </p>
        {onExit && (
          <button
            onClick={onExit}
            className="text-xs uppercase tracking-wider text-tundra-gold hover:text-yellow-300"
          >
            ← Volver
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tundra-bg text-white font-body">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/70 border-b border-tundra-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-5 h-5 text-tundra-gold" />
            <div className="font-display text-xl text-tundra-gold tracking-wider">
              ADMIN<span className="text-white">.panel</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs uppercase tracking-wider text-white/40">
            <span>{user.email}</span>
            {onExit && (
              <button
                onClick={onExit}
                className="text-tundra-gold hover:text-yellow-300"
              >
                Salir →
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pt-8">
        {statsError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            {statsError}
          </div>
        ) : stats === null ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-lg border border-tundra-border bg-white/[0.02] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {stats.cards.map((c) => (
              <KpiCard key={c.key} card={c} />
            ))}
          </div>
        )}
      </section>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <nav className="max-w-7xl mx-auto px-6 pt-8">
        <div className="flex flex-wrap gap-1 border-b border-tundra-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={[
                  'flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-wider transition-colors border-b-2 -mb-px',
                  active
                    ? 'text-tundra-gold border-tundra-gold'
                    : 'text-white/40 border-transparent hover:text-white/70',
                ].join(' ')}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Suspense fallback={<TabSpinner />}>
          {activeTab === 'quotations' && <AdminQuotationsTab />}
          {activeTab === 'catalog' && <AdminCatalogTab />}
          {activeTab === 'invoices' && <AdminInvoicesTab />}
          {activeTab === 'support' && <TicketKanban />}
          {activeTab === 'api_keys' && <AdminApiKeysTab />}
        </Suspense>
      </main>
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────

function KpiCard({ card }: { card: StatsCard }): JSX.Element {
  const toneClass: Record<StatsCard['tone'], string> = {
    neutral: 'border-tundra-border text-white/80',
    good: 'border-emerald-500/40 text-emerald-300',
    warn: 'border-yellow-500/40 text-yellow-300',
    danger: 'border-red-500/40 text-red-300',
  };
  return (
    <div
      className={[
        'rounded-lg border bg-white/[0.02] px-4 py-3 flex flex-col gap-1',
        toneClass[card.tone],
      ].join(' ')}
    >
      <span className="text-[10px] uppercase tracking-wider text-white/40">
        {card.label}
      </span>
      <span className="font-display text-2xl">{card.value}</span>
      {card.delta_pct !== null && (
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          {card.delta_pct >= 0 ? '+' : ''}
          {card.delta_pct.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

function TabSpinner(): JSX.Element {
  return (
    <div className="flex items-center justify-center py-20 text-white/30 text-xs uppercase tracking-wider">
      Cargando módulo…
    </div>
  );
}
