/**
 * Dashboard — hub del cliente autenticado.
 *
 * Spec:
 * - Orquestor.md línea 117: pages/ — Landing, Dashboard, Admin (3 page-level).
 * - Mientras Landing es público + Admin es administración, este Dashboard
 *   es la vista del CLIENTE: ve lo que tiene, no administra el sistema.
 * - Reusa páginas existentes (QuotationsPage, SupportTicketsPage,
 *   OnboardingPage) sin duplicar código.
 * - Protección de ruta: solo authenticated. Si !user → redirige al landing.
 *
 * Tabs (5):
 *   1. Mis servicios   → MyServicesTab (internet contratado)
 *   2. Mis facturas    → MyInvoicesTab
 *   3. Cotizaciones    → QuotationsPage (chat con admin)
 *   4. Tickets         → SupportTicketsPage (reportes de fallas)
 *   5. Mi perfil       → OnboardingPage en modo edit
 */

import { lazy, Suspense, useState } from 'react';
import {
  FileText,
  HeadphonesIcon,
  LayoutDashboard,
  MessageSquare,
  User as UserIcon,
  Wifi,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';

// Lazy-load para no inflar el bundle inicial.
const MyServicesTab = lazy(() =>
  import('../components/dashboard/MyServicesTab').then((m) => ({
    default: m.MyServicesTab,
  })),
);
const MyInvoicesTab = lazy(() =>
  import('../components/dashboard/MyInvoicesTab').then((m) => ({
    default: m.MyInvoicesTab,
  })),
);
const QuotationsPage = lazy(() =>
  import('./QuotationsPage').then((m) => ({ default: m.QuotationsPage })),
);
const SupportTicketsPage = lazy(() =>
  import('./SupportTicketsPage').then((m) => ({
    default: m.SupportTicketsPage,
  })),
);
const OnboardingPage = lazy(() =>
  import('./OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);

type TabKey = 'services' | 'invoices' | 'quotations' | 'tickets' | 'profile';

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof Wifi;
}

const TABS: TabDef[] = [
  { key: 'services', label: 'Mis servicios', icon: Wifi },
  { key: 'invoices', label: 'Mis facturas', icon: FileText },
  { key: 'quotations', label: 'Cotizaciones', icon: MessageSquare },
  { key: 'tickets', label: 'Tickets', icon: HeadphonesIcon },
  { key: 'profile', label: 'Mi perfil', icon: UserIcon },
];

interface DashboardProps {
  onExit?: () => void;
  /** Para QuotationsPage — vuelve al landing para abrir el overlay del servicio. */
  onStartNewQuotation: () => void;
}

export function Dashboard({
  onExit,
  onStartNewQuotation,
}: DashboardProps): JSX.Element {
  const { user, status } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('services');

  // Protección: solo authenticated. Si no hay user, AppShell debe haber
  // redirigido al landing antes de llegar aquí — defense in depth.
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-tundra-bg flex items-center justify-center text-white/40 text-sm uppercase tracking-wider">
        Cargando…
      </div>
    );
  }
  if (status !== 'authenticated' || !user) {
    return (
      <div className="min-h-screen bg-tundra-bg flex flex-col items-center justify-center gap-6 text-center px-6">
        <div className="font-display text-2xl text-tundra-gold">
          Inicia sesión
        </div>
        <p className="text-white/50 text-sm uppercase tracking-wider">
          Necesitas estar autenticado para ver tu panel.
        </p>
        {onExit && (
          <button
            onClick={onExit}
            className="text-xs uppercase tracking-wider text-tundra-gold hover:text-yellow-300"
          >
            ← Volver al inicio
          </button>
        )}
      </div>
    );
  }

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.email;

  return (
    <div className="min-h-screen bg-tundra-bg text-white font-body">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/70 border-b border-tundra-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-5 h-5 text-tundra-gold" />
            <div className="font-display text-xl text-tundra-gold tracking-wider">
              MI<span className="text-white">.panel</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs uppercase tracking-wider">
            <span className="text-white/60 hidden sm:inline">{displayName}</span>
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

      {/* ── Welcome banner ───────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pt-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl text-white">
            Hola, <span className="text-tundra-gold">{displayName}</span>
          </h1>
          <p className="text-sm text-white/50">
            {user.account_type === 'empresa'
              ? 'Cuenta empresarial'
              : 'Cuenta personal'}{' '}
            · {user.email}
          </p>
        </div>
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
          {activeTab === 'services' && <MyServicesTab />}
          {activeTab === 'invoices' && <MyInvoicesTab />}
          {activeTab === 'quotations' && (
            <QuotationsPage onStartNew={onStartNewQuotation} />
          )}
          {activeTab === 'tickets' && <SupportTicketsPage />}
          {activeTab === 'profile' && (
            <OnboardingPage onComplete={() => setActiveTab('services')} />
          )}
        </Suspense>
      </main>
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
