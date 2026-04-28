/**
 * SupportTicketsPage — pantalla cliente con sidebar + detalle.
 *
 * Spec:
 *   - Orquestor.md §FASE 6
 *   - R2 No `any`
 *   - R3 Auth requerida (gate explícito).
 *   - R10 Recibe ticket_updated por WS para refrescar la lista.
 *
 * Layout:
 *   - Desktop: sidebar 320px + detalle.
 *   - Mobile: una vista a la vez con back button.
 */

import { ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { TicketCreator } from '../components/TicketCreator';
import { TicketDetail } from '../components/TicketDetail';
import { TicketList } from '../components/TicketList';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { ApiError, ticketsApi, type SupportTicket } from '../services/api';

const SIDEBAR_POLL_MS = 20_000;

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: SupportTicket[] };

export function SupportTicketsPage(): JSX.Element {
  const { status: authStatus } = useAuth();
  const { status: wsStatus, subscribe } = useWebSocket();

  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);

  // ── Fetch lista ─────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    try {
      const res = await ticketsApi.myTickets();
      setList({ status: 'ready', items: res.items });
      // Auto-seleccionar el primero solo en el load inicial.
      setActiveId((prev) => prev ?? res.items[0]?.id ?? null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudieron cargar los tickets';
      setList({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadList();
  }, [authStatus, loadList]);

  // ── Polling fallback de la sidebar ──────────────────────────────────────
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const interval = wsStatus === 'open' ? 0 : SIDEBAR_POLL_MS;
    if (interval <= 0) return;
    const id = window.setInterval(() => {
      void loadList();
    }, interval);
    return () => window.clearInterval(id);
  }, [authStatus, loadList, wsStatus]);

  // ── Listener WS: ticket_updated → refrescar lista ───────────────────────
  useEffect(() => {
    const cleanup = subscribe('ticket_updated', () => {
      void loadList();
    });
    return cleanup;
  }, [subscribe, loadList]);

  // ── Listener WS: ticket_created (admin lo recibe; cliente no, pero
  //    suscribirse no daña: el filtro server-side controla quién recibe).
  useEffect(() => {
    const cleanup = subscribe('ticket_created', () => {
      void loadList();
    });
    return cleanup;
  }, [subscribe, loadList]);

  // ── Tras crear desde el modal, hidratamos lista y seleccionamos ─────────
  const handleCreated = useCallback(
    (ticket: SupportTicket) => {
      setActiveId(ticket.id);
      void loadList();
    },
    [loadList],
  );

  // ── Auth gate ───────────────────────────────────────────────────────────
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tundra-bg text-white/40 text-sm">
        Cargando…
      </div>
    );
  }
  if (authStatus !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tundra-bg text-white">
        <div className="max-w-md text-center px-6">
          <ShieldAlert
            size={48}
            className="mx-auto text-tundra-gold mb-4"
            aria-hidden
          />
          <h2 className="font-display text-2xl mb-3">
            Inicia sesión para ver tus reportes
          </h2>
          <p className="text-white/50 text-sm">
            Necesitas tu cuenta para crear y dar seguimiento a reportes de fallas.
          </p>
        </div>
      </div>
    );
  }

  const items = list.status === 'ready' ? list.items : [];

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-tundra-bg text-white">
      {/* Sidebar */}
      <aside
        className={[
          'flex flex-col border-tundra-border',
          'lg:w-80 lg:border-r lg:flex',
          activeId ? 'hidden lg:flex' : 'flex',
        ].join(' ')}
      >
        {list.status === 'error' ? (
          <div className="p-6 text-center text-white/50 text-sm">
            <p>{list.message}</p>
            <button
              type="button"
              onClick={() => void loadList()}
              className="mt-3 text-xs uppercase tracking-wider text-tundra-gold hover:text-tundra-goldBright"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <TicketList
            tickets={items}
            selectedId={activeId}
            onSelect={setActiveId}
            onCreate={() => setCreatorOpen(true)}
            emptyMessage="Aún no has creado tickets."
          />
        )}
      </aside>

      {/* Detalle */}
      <section
        className={[
          'flex-1 flex flex-col',
          activeId ? 'flex' : 'hidden lg:flex',
        ].join(' ')}
      >
        {activeId ? (
          <TicketDetail
            ticketId={activeId}
            viewerIsAdmin={false}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center text-center px-6">
            <div className="max-w-sm">
              <ShieldAlert
                size={48}
                className="mx-auto text-white/20 mb-4"
                aria-hidden
              />
              <p className="text-white/40 text-sm">
                Selecciona un ticket para ver el detalle.
              </p>
            </div>
          </div>
        )}
      </section>

      <TicketCreator
        open={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
