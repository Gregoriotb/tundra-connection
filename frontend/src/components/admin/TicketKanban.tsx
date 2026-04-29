/**
 * TicketKanban — vista admin tipo Kanban de tickets.
 *
 * Spec:
 *   - Orquestor.md §FASE 6
 *   - R2 No `any`
 *   - R3 require_admin (la página padre lo verifica antes de montar).
 *
 * Diseño:
 *   - 6 columnas por estado: abierto / en_revision / remitido / en_proceso /
 *     solucionado / cancelado.
 *   - Cards arrastrables NO — el cambio de estado se hace con un select
 *     compacto en cada card (sin agregar lib de drag-and-drop al stack).
 *   - Filtros: prioridad, assigned_to_me.
 *   - Click en card → abre detalle (TicketDetail con viewerIsAdmin=true)
 *     en un panel lateral overlay.
 */

import { Filter, ShieldAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ApiError,
  ticketsApi,
  type SupportTicket,
  type TicketEstado,
  type TicketPrioridad,
} from '../../services/api';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { TicketDetail } from '../TicketDetail';

// ─── Constantes visuales ──────────────────────────────────────────────────

const COLUMNS: { estado: TicketEstado; title: string }[] = [
  { estado: 'abierto', title: 'Abiertos' },
  { estado: 'en_revision', title: 'En revisión' },
  { estado: 'remitido', title: 'Remitidos' },
  { estado: 'en_proceso', title: 'En proceso' },
  { estado: 'solucionado', title: 'Solucionados' },
  { estado: 'cancelado', title: 'Cancelados' },
];

const COLUMN_TONE: Record<TicketEstado, string> = {
  abierto: 'border-tundra-gold/30 bg-tundra-gold/5',
  en_revision: 'border-blue-400/30 bg-blue-400/5',
  remitido: 'border-purple-400/30 bg-purple-400/5',
  en_proceso: 'border-tundra-warning/30 bg-tundra-warning/5',
  solucionado: 'border-tundra-success/30 bg-tundra-success/5',
  cancelado: 'border-white/10 bg-white/[0.02]',
};

const PRIORIDAD_DOT: Record<TicketPrioridad, string> = {
  baja: 'bg-white/30',
  media: 'bg-tundra-gold',
  alta: 'bg-tundra-warning',
  critica: 'bg-tundra-danger',
};

const PRIORIDAD_LABEL: Record<TicketPrioridad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

const ALL_ESTADOS: TicketEstado[] = COLUMNS.map((c) => c.estado);
const ALL_PRIORIDADES: TicketPrioridad[] = ['baja', 'media', 'alta', 'critica'];

// ─── Estado del fetch ─────────────────────────────────────────────────────

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: SupportTicket[] };

interface Filters {
  prioridad: TicketPrioridad | 'all';
  assigned_to_me: boolean;
}

// ─── Componente ───────────────────────────────────────────────────────────

export function TicketKanban(): JSX.Element {
  const { status: wsStatus, subscribe } = useWebSocket();
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [filters, setFilters] = useState<Filters>({
    prioridad: 'all',
    assigned_to_me: false,
  });
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  // ── Fetch ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await ticketsApi.adminList({
        prioridad: filters.prioridad !== 'all' ? filters.prioridad : undefined,
        assigned_to_me: filters.assigned_to_me || undefined,
      });
      setState({ status: 'ready', items: res.items });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudieron cargar los tickets';
      setState({ status: 'error', message });
    }
  }, [filters.prioridad, filters.assigned_to_me]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Polling fallback (15s) si WS caído ──────────────────────────────────
  useEffect(() => {
    if (wsStatus === 'open') return;
    const id = window.setInterval(() => {
      void load();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [wsStatus, load]);

  // ── Listeners WS ────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      subscribe('ticket_created', () => void load()),
      subscribe('ticket_updated', () => void load()),
    ];
    return () => cleanups.forEach((c) => c());
  }, [subscribe, load]);

  // ── Quick status change desde la card ───────────────────────────────────
  const handleQuickStatus = useCallback(
    async (ticketId: string, nextEstado: TicketEstado) => {
      setStatusUpdating(ticketId);
      // Optimista: modifica la card en la columna nueva inmediatamente.
      setState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              items: prev.items.map((t) =>
                t.id === ticketId ? { ...t, estado: nextEstado } : t,
              ),
            }
          : prev,
      );
      try {
        await ticketsApi.adminUpdateStatus(ticketId, { estado: nextEstado });
      } catch (err) {
        // Si falla, refrescamos para volver al estado del server.
        const message =
          err instanceof ApiError
            ? err.detail
            : 'No se pudo actualizar el estado';
        // eslint-disable-next-line no-console
        console.error('TicketKanban.quickStatus', message);
        void load();
      } finally {
        setStatusUpdating(null);
      }
    },
    [load],
  );

  // ── Items agrupados por estado ──────────────────────────────────────────
  const itemsByEstado = useMemo(() => {
    const empty: Record<TicketEstado, SupportTicket[]> = {
      abierto: [],
      en_revision: [],
      remitido: [],
      en_proceso: [],
      solucionado: [],
      cancelado: [],
    };
    if (state.status !== 'ready') return empty;
    for (const t of state.items) {
      empty[t.estado].push(t);
    }
    return empty;
  }, [state]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-tundra-bg text-white">
      {/* Header con filtros */}
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-tundra-border bg-tundra-surface">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-tundra-gold mb-0.5">
            Panel admin
          </p>
          <h1 className="font-display text-xl">Reportes de fallas</h1>
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-white/30" aria-hidden />
          <select
            value={filters.prioridad}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                prioridad: e.target.value as TicketPrioridad | 'all',
              }))
            }
            className="text-xs rounded-md px-2 py-1 bg-tundra-bg border border-white/10 text-white/80 focus:outline-none focus:border-tundra-gold"
          >
            <option value="all">Todas las prioridades</option>
            {ALL_PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDAD_LABEL[p]}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.assigned_to_me}
              onChange={(e) =>
                setFilters((f) => ({ ...f, assigned_to_me: e.target.checked }))
              }
              className="accent-tundra-gold"
            />
            Asignados a mí
          </label>
        </div>
      </header>

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-12">
          <ShieldAlert size={36} className="text-tundra-danger" aria-hidden />
          <p className="text-white/60 text-sm">{state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="px-4 py-2 rounded-lg border border-tundra-gold text-tundra-gold text-xs uppercase tracking-wider hover:bg-tundra-gold hover:text-black transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Kanban */}
      {state.status !== 'error' && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="grid grid-flow-col auto-cols-[300px] gap-4 p-4 h-full">
            {COLUMNS.map((col) => {
              const items = itemsByEstado[col.estado];
              return (
                <div
                  key={col.estado}
                  className={[
                    'flex flex-col rounded-2xl border h-full overflow-hidden',
                    COLUMN_TONE[col.estado],
                  ].join(' ')}
                >
                  <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <h3 className="font-display text-sm">{col.title}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      {items.length}
                    </span>
                  </header>

                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {state.status === 'loading' &&
                      [0, 1].map((i) => (
                        <div
                          key={i}
                          aria-hidden
                          className="h-24 rounded-xl bg-white/5 animate-pulse"
                        />
                      ))}

                    {state.status === 'ready' && items.length === 0 && (
                      <p className="text-center py-6 text-[11px] text-white/30">
                        Sin tickets
                      </p>
                    )}

                    {state.status === 'ready' &&
                      items.map((t) => (
                        <KanbanCard
                          key={t.id}
                          ticket={t}
                          onOpen={() => setOpenTicketId(t.id)}
                          onChangeStatus={(estado) =>
                            void handleQuickStatus(t.id, estado)
                          }
                          isUpdating={statusUpdating === t.id}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drawer detalle */}
      {openTicketId && (
        <div className="fixed inset-0 z-[120] flex">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpenTicketId(null)}
            className="flex-1 bg-black/70 backdrop-blur-sm"
          />
          <aside className="w-full max-w-2xl bg-tundra-bg border-l border-tundra-border flex flex-col relative animate-[fade-in_200ms_ease-out]">
            <button
              type="button"
              onClick={() => setOpenTicketId(null)}
              aria-label="Cerrar detalle"
              className="absolute top-4 right-4 p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors z-10"
            >
              <X size={20} aria-hidden />
            </button>
            <TicketDetail ticketId={openTicketId} viewerIsAdmin={true} />
          </aside>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponente: KanbanCard ────────────────────────────────────────────

interface KanbanCardProps {
  ticket: SupportTicket;
  onOpen: () => void;
  onChangeStatus: (estado: TicketEstado) => void;
  isUpdating: boolean;
}

function KanbanCard({
  ticket,
  onOpen,
  onChangeStatus,
  isUpdating,
}: KanbanCardProps): JSX.Element {
  return (
    <div
      className={[
        'rounded-xl bg-tundra-surface border border-white/5 p-3',
        'transition-all hover:border-tundra-gold/40',
        isUpdating && 'opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left mb-3"
        aria-label={`Abrir ticket ${ticket.ticket_number}`}
      >
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-tundra-gold/80">
            {ticket.ticket_number}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
            <span
              className={[
                'inline-block w-1.5 h-1.5 rounded-full',
                PRIORIDAD_DOT[ticket.prioridad],
              ].join(' ')}
              aria-hidden
            />
            {PRIORIDAD_LABEL[ticket.prioridad]}
          </span>
        </div>
        <p className="text-sm text-white font-medium line-clamp-2 mb-2">
          {ticket.titulo}
        </p>
        <p className="text-[11px] text-white/50 truncate">
          {ticket.user.first_name ?? 'Cliente'} {ticket.user.last_name ?? ''}
          {ticket.assignee && (
            <>
              {' · '}
              <span className="text-tundra-gold">
                → {ticket.assignee.first_name ?? 'admin'}
              </span>
            </>
          )}
        </p>
      </button>

      {/* Quick action: cambio de estado */}
      <select
        value={ticket.estado}
        onChange={(e) => onChangeStatus(e.target.value as TicketEstado)}
        disabled={isUpdating}
        onClick={(e) => e.stopPropagation()}
        className="w-full text-[10px] uppercase tracking-wider rounded-md px-2 py-1.5 bg-tundra-bg border border-white/10 text-white/70 focus:outline-none focus:border-tundra-gold disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Cambiar estado del ticket"
      >
        {ALL_ESTADOS.map((est) => (
          <option key={est} value={est}>
            {est.replace('_', ' ')}
          </option>
        ))}
      </select>
    </div>
  );
}
