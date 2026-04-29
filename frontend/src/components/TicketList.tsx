/**
 * TicketList — listado de tickets (cliente o admin).
 *
 * Spec:
 *   - Orquestor.md §FASE 6
 *   - R2 No `any`
 *
 * Diseño:
 *   - Cada item muestra: ticket_number, titulo, estado badge, prioridad,
 *     servicio, updated_at relativo.
 *   - Filtros opcionales: estado y prioridad (los maneja el padre y los
 *     pasa por props para que la lista sea pura).
 */

import { Filter, Plus } from 'lucide-react';
import { useMemo } from 'react';

import type {
  SupportTicket,
  TicketEstado,
  TicketPrioridad,
  TicketServicio,
} from '../services/api';

// ─── Props ────────────────────────────────────────────────────────────────

interface TicketListProps {
  tickets: SupportTicket[];
  selectedId: string | null;
  onSelect: (ticketId: string) => void;
  onCreate?: () => void;          // botón "Nuevo ticket" (cliente)
  filterEstado?: TicketEstado | 'all';
  filterPrioridad?: TicketPrioridad | 'all';
  onFilterEstado?: (v: TicketEstado | 'all') => void;
  onFilterPrioridad?: (v: TicketPrioridad | 'all') => void;
  emptyMessage?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<TicketEstado, string> = {
  abierto: 'Abierto',
  en_revision: 'En revisión',
  remitido: 'Remitido',
  en_proceso: 'En proceso',
  solucionado: 'Solucionado',
  cancelado: 'Cancelado',
};

const ESTADO_TONE: Record<TicketEstado, string> = {
  abierto: 'bg-tundra-gold/15 text-tundra-gold border-tundra-gold/30',
  en_revision: 'bg-blue-400/15 text-blue-300 border-blue-400/30',
  remitido: 'bg-purple-400/15 text-purple-300 border-purple-400/30',
  en_proceso: 'bg-tundra-warning/15 text-tundra-warning border-tundra-warning/30',
  solucionado: 'bg-tundra-success/15 text-tundra-success border-tundra-success/30',
  cancelado: 'bg-white/5 text-white/40 border-white/10',
};

const PRIORIDAD_LABEL: Record<TicketPrioridad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

const PRIORIDAD_DOT: Record<TicketPrioridad, string> = {
  baja: 'bg-white/30',
  media: 'bg-tundra-gold',
  alta: 'bg-tundra-warning',
  critica: 'bg-tundra-danger',
};

const SERVICIO_LABEL: Record<TicketServicio, string> = {
  fibra_optica: 'Fibra óptica',
  satelital: 'Satelital',
  servicios_extras: 'Extras',
  otro: 'Otro',
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'ahora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} d`;
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
  });
}

// ─── Subcomponente: ítem ──────────────────────────────────────────────────

interface TicketListItemProps {
  ticket: SupportTicket;
  active: boolean;
  onSelect: (id: string) => void;
}

function TicketListItem({
  ticket,
  active,
  onSelect,
}: TicketListItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(ticket.id)}
      className={[
        'w-full text-left p-4 rounded-xl border transition-all duration-200',
        active
          ? 'bg-tundra-gold/10 border-tundra-gold'
          : 'bg-tundra-surface border-white/5 hover:border-tundra-gold/30',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-tundra-gold/80">
          {ticket.ticket_number}
        </span>
        <span className="text-[10px] text-white/30 flex-shrink-0">
          {relativeTime(ticket.updated_at)}
        </span>
      </div>

      <p className="text-sm text-white font-medium truncate mb-2">
        {ticket.titulo}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={[
            'inline-flex items-center px-2 py-0.5 rounded-full',
            'text-[9px] uppercase tracking-wider font-semibold border',
            ESTADO_TONE[ticket.estado],
          ].join(' ')}
        >
          {ESTADO_LABEL[ticket.estado]}
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

        <span className="text-[10px] text-white/30">·</span>

        <span className="text-[10px] text-white/40">
          {SERVICIO_LABEL[ticket.servicio_relacionado]}
        </span>
      </div>
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export function TicketList({
  tickets,
  selectedId,
  onSelect,
  onCreate,
  filterEstado,
  filterPrioridad,
  onFilterEstado,
  onFilterPrioridad,
  emptyMessage,
}: TicketListProps): JSX.Element {
  const visibleTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterEstado && filterEstado !== 'all' && t.estado !== filterEstado) {
        return false;
      }
      if (
        filterPrioridad &&
        filterPrioridad !== 'all' &&
        t.prioridad !== filterPrioridad
      ) {
        return false;
      }
      return true;
    });
  }, [tickets, filterEstado, filterPrioridad]);

  const hasFilters =
    onFilterEstado !== undefined || onFilterPrioridad !== undefined;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-5 py-4 border-b border-tundra-border bg-tundra-surface">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-tundra-gold">
            Reportes
          </p>
          <h1 className="font-display text-lg">Tickets</h1>
        </div>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            aria-label="Crear nuevo ticket"
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-tundra-gold text-black hover:bg-tundra-goldBright transition-colors text-xs uppercase tracking-wider font-semibold"
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden />
            Nuevo
          </button>
        )}
      </header>

      {hasFilters && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-tundra-border bg-tundra-bg/40">
          <Filter size={12} className="text-white/30" aria-hidden />
          {onFilterEstado && (
            <select
              value={filterEstado ?? 'all'}
              onChange={(e) =>
                onFilterEstado(e.target.value as TicketEstado | 'all')
              }
              className="text-xs rounded-md px-2 py-1 bg-tundra-surface border border-white/10 text-white/80 focus:outline-none focus:border-tundra-gold"
            >
              <option value="all">Todos los estados</option>
              {(Object.keys(ESTADO_LABEL) as TicketEstado[]).map((k) => (
                <option key={k} value={k}>
                  {ESTADO_LABEL[k]}
                </option>
              ))}
            </select>
          )}
          {onFilterPrioridad && (
            <select
              value={filterPrioridad ?? 'all'}
              onChange={(e) =>
                onFilterPrioridad(e.target.value as TicketPrioridad | 'all')
              }
              className="text-xs rounded-md px-2 py-1 bg-tundra-surface border border-white/10 text-white/80 focus:outline-none focus:border-tundra-gold"
            >
              <option value="all">Todas las prioridades</option>
              {(Object.keys(PRIORIDAD_LABEL) as TicketPrioridad[]).map((k) => (
                <option key={k} value={k}>
                  {PRIORIDAD_LABEL[k]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {visibleTickets.length === 0 ? (
          <div className="px-4 py-12 text-center text-white/30 text-sm">
            {emptyMessage ?? 'No hay tickets que mostrar.'}
          </div>
        ) : (
          visibleTickets.map((t) => (
            <TicketListItem
              key={t.id}
              ticket={t}
              active={t.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
