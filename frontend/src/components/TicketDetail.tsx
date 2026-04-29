/**
 * TicketDetail — vista detalle de un ticket (cliente o admin).
 *
 * Spec:
 *   - Orquestor.md §FASE 6
 *   - R2 No `any`. Acepta SupportTicket o SupportTicketDetail.
 *   - R3 Auth requerida.
 *   - R10 Push WS — subscribe al ticket. Polling fallback 30s si WS caído.
 *
 * Layout:
 *   - Header con ticket_number, badges, asignación.
 *   - Cuerpo: descripción inicial + adjuntos.
 *   - Timeline de eventos (historial_estados) si está disponible (admin).
 *   - Input de reply al fondo (deshabilitado si terminal).
 *
 * Variants:
 *   - viewerIsAdmin=true  → muestra notas_internas y permite ver historial
 *                            entries con kind='internal_note'.
 *   - viewerIsAdmin=false → oculta notas_internas + entries internal_note.
 */

import {
  AlertTriangle,
  Bot,
  Check,
  Download,
  File as FileIconBase,
  FileText,
  Image as ImageIcon,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import {
  ApiError,
  ticketsApi,
  type HistorialEntry,
  type SupportTicket,
  type SupportTicketDetail,
  type TicketAttachment,
  type TicketEstado,
  type TicketPrioridad,
} from '../services/api';

// ─── Props ────────────────────────────────────────────────────────────────

interface TicketDetailProps {
  ticketId: string;
  viewerIsAdmin?: boolean;
  /** Para volver a la lista en mobile. */
  onBack?: () => void;
}

const POLL_FALLBACK_MS = 30_000;
const MAX_REPLY = 4000;
const TERMINAL: ReadonlySet<TicketEstado> = new Set(['solucionado', 'cancelado']);

// ─── Tone maps (re-usables) ───────────────────────────────────────────────

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

const PRIORIDAD_TONE: Record<TicketPrioridad, string> = {
  baja: 'text-white/60',
  media: 'text-tundra-gold',
  alta: 'text-tundra-warning',
  critica: 'text-tundra-danger',
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function pickAttachmentIcon(mime: string) {
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime === 'application/pdf' || mime.startsWith('text/')) return FileText;
  return FileIconBase;
}

// Type guard para distinguir SupportTicket vs SupportTicketDetail.
function hasHistorial(t: SupportTicket | SupportTicketDetail): t is SupportTicketDetail {
  return Array.isArray((t as SupportTicketDetail).historial_estados);
}

// ─── Componente ───────────────────────────────────────────────────────────

export function TicketDetail({
  ticketId,
  viewerIsAdmin = false,
  onBack,
}: TicketDetailProps): JSX.Element {
  const { user } = useAuth();
  const { status: wsStatus, subscribe, subscribeTicket, unsubscribeTicket } =
    useWebSocket();

  const [ticket, setTicket] = useState<SupportTicket | SupportTicketDetail | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  const isTerminal = ticket ? TERMINAL.has(ticket.estado) : false;
  const canReply =
    ticket !== null &&
    !isTerminal &&
    !sending &&
    draft.trim().length > 0;

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchTicket = useCallback(async () => {
    try {
      const data = viewerIsAdmin
        ? await ticketsApi.adminGet(ticketId)
        : await ticketsApi.getMine(ticketId);
      setTicket((prev) => {
        // Diff básico: si nada cambió en updated_at e historial length, no rerender.
        if (
          prev &&
          prev.updated_at === data.updated_at &&
          (hasHistorial(prev) ? prev.historial_estados.length : 0) ===
            (hasHistorial(data) ? data.historial_estados.length : 0)
        ) {
          return prev;
        }
        return data;
      });
      setError(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudo cargar el ticket';
      setError(message);
    }
  }, [ticketId, viewerIsAdmin]);

  useEffect(() => {
    setTicket(null);
    setError(null);
    void fetchTicket();
  }, [fetchTicket]);

  // ── Polling fallback (solo si WS caído) ─────────────────────────────────
  useEffect(() => {
    const interval = wsStatus === 'open' ? 0 : POLL_FALLBACK_MS;
    if (interval <= 0) return;
    const id = window.setInterval(() => {
      void fetchTicket();
    }, interval);
    return () => window.clearInterval(id);
  }, [fetchTicket, wsStatus]);

  // ── Subscripción WS al ticket ───────────────────────────────────────────
  useEffect(() => {
    if (wsStatus !== 'open') return;
    subscribeTicket(ticketId);
    return () => unsubscribeTicket(ticketId);
  }, [ticketId, wsStatus, subscribeTicket, unsubscribeTicket]);

  // ── Listener: ticket_updated → refetch ──────────────────────────────────
  useEffect(() => {
    const cleanup = subscribe('ticket_updated', (payload) => {
      const upd = payload as { ticket_id?: string };
      if (upd.ticket_id !== ticketId) return;
      void fetchTicket();
    });
    return cleanup;
  }, [subscribe, ticketId, fetchTicket]);

  // ── Auto-scroll al fondo del timeline cuando llegan nuevos eventos ──────
  useEffect(() => {
    if (!ticket) return;
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [ticket && hasHistorial(ticket) ? ticket.historial_estados.length : 0, ticket]);

  // ── Submit reply ────────────────────────────────────────────────────────
  const handleReply = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canReply || !ticket) return;
      const content = draft.trim();
      setSending(true);
      setSendError(null);
      try {
        await ticketsApi.reply(ticket.id, { content });
        setDraft('');
        // El WS push refrescará el ticket; si llega tarde, refetch inmediato:
        await fetchTicket();
      } catch (err) {
        const message =
          err instanceof ApiError ? err.detail : 'No se pudo enviar la respuesta';
        setSendError(message);
      } finally {
        setSending(false);
      }
    },
    [canReply, ticket, draft, fetchTicket],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  if (error && !ticket) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <AlertTriangle size={36} className="text-tundra-danger" aria-hidden />
        <p className="text-white/60 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => void fetchTicket()}
          className="px-4 py-2 rounded-lg border border-tundra-gold text-tundra-gold text-xs uppercase tracking-wider hover:bg-tundra-gold hover:text-black transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col gap-3 p-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-white/5 animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  const detail = hasHistorial(ticket) ? ticket : null;
  const allHistory: HistorialEntry[] = detail?.historial_estados ?? [];

  // El cliente NO debe ver entries con kind='internal_note'.
  const visibleHistory = allHistory.filter(
    (h) => viewerIsAdmin || h.kind !== 'internal_note',
  );

  return (
    <div className="flex flex-col h-full bg-tundra-bg text-white">
      {/* Header */}
      <header className="px-6 py-4 border-b border-tundra-border bg-tundra-surface">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="lg:hidden mb-3 inline-flex items-center gap-1 text-xs uppercase tracking-wider text-tundra-gold"
          >
            ← Volver
          </button>
        )}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-tundra-gold/80 mb-1">
              {ticket.ticket_number}
            </p>
            <h2 className="font-display text-xl text-white truncate">
              {ticket.titulo}
            </h2>
            <p className="text-[11px] text-white/40 mt-1">
              Creado {formatDateTime(ticket.created_at)}
              {ticket.user.first_name && (
                <> · por {ticket.user.first_name} {ticket.user.last_name ?? ''}</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={[
                'inline-flex items-center px-2.5 py-1 rounded-full',
                'text-[10px] uppercase tracking-wider font-semibold border',
                ESTADO_TONE[ticket.estado],
              ].join(' ')}
            >
              {ESTADO_LABEL[ticket.estado]}
            </span>
            <span
              className={[
                'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold',
                PRIORIDAD_TONE[ticket.prioridad],
              ].join(' ')}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
              {PRIORIDAD_LABEL[ticket.prioridad]}
            </span>
          </div>
        </div>

        {ticket.assignee && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/50">
            <UserCheck size={12} className="text-tundra-gold" aria-hidden />
            Asignado a {ticket.assignee.first_name ?? 'admin'}{' '}
            {ticket.assignee.last_name ?? ''}
          </p>
        )}
      </header>

      {/* Body scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Descripción inicial */}
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
            Descripción
          </p>
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
            {ticket.descripcion}
          </p>
        </section>

        {/* Adjuntos */}
        {ticket.adjuntos.length > 0 && (
          <section>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
              Adjuntos ({ticket.adjuntos.length})
            </p>
            <ul className="space-y-1.5">
              {ticket.adjuntos.map((att, i) => (
                <AttachmentRow key={`${att.url}-${i}`} attachment={att} />
              ))}
            </ul>
          </section>
        )}

        {/* Timeline (solo si es admin o detail con historial) */}
        {visibleHistory.length > 0 && (
          <section>
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">
              Timeline
            </p>
            <ol className="space-y-2.5">
              {visibleHistory.map((h, i) => (
                <HistoryEntry
                  key={`${h.at}-${i}`}
                  entry={h}
                  currentUserId={user?.id ?? ''}
                />
              ))}
            </ol>
          </section>
        )}

        {/* Notas internas (solo admin) */}
        {viewerIsAdmin && detail?.notas_internas && (
          <section className="rounded-xl border border-tundra-warning/30 bg-tundra-warning/5 p-4">
            <p className="text-[10px] uppercase tracking-wider text-tundra-warning mb-2 inline-flex items-center gap-1.5">
              <ShieldAlert size={12} aria-hidden />
              Notas internas (no visibles al cliente)
            </p>
            <pre className="text-xs text-white/70 whitespace-pre-wrap font-body leading-relaxed">
              {detail.notas_internas}
            </pre>
          </section>
        )}

        <div ref={timelineEndRef} aria-hidden />
      </div>

      {/* Input de reply */}
      <form
        onSubmit={handleReply}
        className="border-t border-tundra-border bg-tundra-surface p-4"
      >
        {sendError && (
          <p className="mb-2 text-xs text-tundra-danger" role="alert">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_REPLY))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canReply) void handleReply(e as unknown as FormEvent);
              }
            }}
            disabled={isTerminal || sending}
            placeholder={
              isTerminal
                ? `Ticket ${ESTADO_LABEL[ticket.estado].toLowerCase()}, no se admiten respuestas`
                : 'Responder al ticket… (Enter para enviar)'
            }
            rows={2}
            className={[
              'flex-1 resize-none rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20',
              'bg-tundra-bg border border-white/10',
              'focus:outline-none focus:border-tundra-gold focus:ring-1 focus:ring-tundra-gold/30',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          />
          <button
            type="submit"
            disabled={!canReply}
            aria-label="Enviar respuesta"
            className={[
              'inline-flex items-center justify-center h-12 w-12 rounded-xl flex-shrink-0',
              'transition-all duration-200',
              canReply
                ? 'bg-tundra-gold text-black hover:bg-tundra-goldBright hover:shadow-[0_0_20px_-4px_rgba(250,204,21,0.6)]'
                : 'bg-white/5 text-white/20 cursor-not-allowed',
            ].join(' ')}
          >
            <Send size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-white/30 text-right">
          {draft.length} / {MAX_REPLY}
        </p>
      </form>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

interface AttachmentRowProps {
  attachment: TicketAttachment;
}

function AttachmentRow({ attachment }: AttachmentRowProps): JSX.Element {
  const Icon = pickAttachmentIcon(attachment.mime_type);
  return (
    <li>
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-tundra-surface border border-white/5 hover:border-tundra-gold/30 transition-colors"
      >
        <Icon size={14} className="text-tundra-gold flex-shrink-0" aria-hidden />
        <span className="text-sm text-white/80 truncate max-w-xs">
          {attachment.filename}
        </span>
        <span className="text-[10px] text-white/30 flex-shrink-0">
          {formatBytes(attachment.size_bytes)}
        </span>
        <Download size={12} className="text-white/40 flex-shrink-0" aria-hidden />
      </a>
    </li>
  );
}

interface HistoryEntryProps {
  entry: HistorialEntry;
  currentUserId: string;
}

function HistoryEntry({ entry, currentUserId }: HistoryEntryProps): JSX.Element {
  const isMine = entry.by_user_id === currentUserId;

  if (entry.kind === 'status_change') {
    return (
      <li className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full bg-tundra-gold/15 text-tundra-gold border border-tundra-gold/30">
          <Bot size={12} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/70">
            <span className="text-tundra-gold font-semibold">
              {entry.from_estado ?? '·'}
            </span>{' '}
            →{' '}
            <span className="text-tundra-gold font-semibold">
              {entry.to_estado}
            </span>
            {entry.nota && <span className="text-white/60"> · {entry.nota}</span>}
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {formatDateTime(entry.at)}
          </p>
        </div>
      </li>
    );
  }

  if (entry.kind === 'assign') {
    return (
      <li className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full bg-purple-400/15 text-purple-300 border border-purple-400/30">
          <UserCheck size={12} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/70">{entry.nota ?? 'Asignación'}</p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {formatDateTime(entry.at)}
          </p>
        </div>
      </li>
    );
  }

  if (entry.kind === 'internal_note') {
    return (
      <li className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full bg-tundra-warning/15 text-tundra-warning border border-tundra-warning/30">
          <ShieldAlert size={12} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-tundra-warning/90">
            Nota interna agregada
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {formatDateTime(entry.at)}
          </p>
        </div>
      </li>
    );
  }

  // kind === 'reply'
  return (
    <li
      className={[
        'flex gap-3 max-w-full',
        isMine ? 'flex-row-reverse' : 'flex-row',
      ].join(' ')}
    >
      <div
        className={[
          'flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full',
          isMine
            ? 'bg-tundra-gold text-black'
            : 'bg-white/10 text-white/60',
        ].join(' ')}
      >
        {isMine ? (
          <Check size={12} aria-hidden />
        ) : (
          <ShieldCheck size={12} aria-hidden />
        )}
      </div>
      <div
        className={[
          'rounded-2xl px-3.5 py-2 max-w-[80%]',
          isMine
            ? 'bg-tundra-gold text-black rounded-tr-sm'
            : 'bg-white/5 text-white/85 border border-white/10 rounded-tl-sm',
        ].join(' ')}
      >
        <p className="text-xs whitespace-pre-wrap leading-relaxed">
          {entry.nota ?? ''}
        </p>
        <p
          className={[
            'mt-1 text-[10px]',
            isMine ? 'text-black/40' : 'text-white/30',
          ].join(' ')}
        >
          {formatDateTime(entry.at)}
        </p>
      </div>
    </li>
  );
}

