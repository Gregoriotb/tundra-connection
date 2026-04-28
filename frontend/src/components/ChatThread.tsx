/**
 * ChatThread — vista de un hilo: lista de mensajes + input.
 *
 * Spec:
 *   - Orquestor.md §FASE 4: chat con polling primero (WS llega en FASE 5).
 *   - R2 No `any`.
 *   - R10 Polling se reemplaza por WebSocket en FASE 5; este código tiene
 *        un punto único de mutación (`setDetail`) que el WS también podrá
 *        invocar — refactor mínimo en F5.
 *
 * Estados:
 *   - 'loading'  — fetch inicial
 *   - 'error'    — fallo de red, con retry
 *   - 'ready'    — render de mensajes y input
 *   - 'closed'   — input deshabilitado por estado terminal del thread
 */

import { AlertTriangle, Send } from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '../contexts/AuthContext';
import { ApiError, chatApi, type QuotationThreadDetail } from '../services/api';
import type { UUID } from '../types';
import { ChatMessage, type ChatMessageData } from './ChatMessage';

// ─── Props ────────────────────────────────────────────────────────────────

interface ChatThreadProps {
  threadId: UUID;
  pollIntervalMs?: number;   // default 5_000
}

const POLL_DEFAULT = 5_000;
const MAX_INPUT = 4000;
const TERMINAL_STATES = new Set(['closed', 'cancelled']);
const ESTADO_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  quoted: 'Cotizado',
  negotiating: 'Negociando',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

// ─── Componente ───────────────────────────────────────────────────────────

export function ChatThread({
  threadId,
  pollIntervalMs = POLL_DEFAULT,
}: ChatThreadProps): JSX.Element {
  const { user } = useAuth();
  const [detail, setDetail] = useState<QuotationThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const initialLoadRef = useRef(true);

  const isTerminal = detail ? TERMINAL_STATES.has(detail.estado) : false;
  const canSend =
    detail !== null && !isTerminal && !sending && draft.trim().length > 0;

  // ── Fetch (manual + polling) ────────────────────────────────────────────
  const fetchThread = useCallback(async () => {
    try {
      const t = await chatApi.getThread(threadId);
      setDetail((prev) => {
        // Sólo reemplazamos si hay cambios en cantidad o último id
        // (evita rerenders innecesarios cuando nada cambió).
        if (
          prev &&
          prev.messages.length === t.messages.length &&
          prev.messages[prev.messages.length - 1]?.id ===
            t.messages[t.messages.length - 1]?.id &&
          prev.estado === t.estado
        ) {
          return prev;
        }
        return t;
      });
      setError(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudo cargar el hilo';
      setError(message);
    }
  }, [threadId]);

  // Carga inicial.
  useEffect(() => {
    initialLoadRef.current = true;
    setDetail(null);
    setError(null);
    void fetchThread();
  }, [fetchThread]);

  // Polling.
  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const id = window.setInterval(() => {
      void fetchThread();
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [fetchThread, pollIntervalMs]);

  // Auto-scroll al fondo cuando hay mensajes nuevos.
  useEffect(() => {
    if (!detail) return;
    listEndRef.current?.scrollIntoView({
      behavior: initialLoadRef.current ? 'auto' : 'smooth',
    });
    initialLoadRef.current = false;
  }, [detail?.messages.length, detail]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canSend || !detail) return;
      const trimmed = draft.trim();
      setSending(true);
      setSendError(null);

      try {
        const msg = await chatApi.postMessage(threadId, { content: trimmed });
        // Append optimista — el polling repondrá si hubo cambios concurrentes.
        setDetail((prev) =>
          prev ? { ...prev, messages: [...prev.messages, msg] } : prev,
        );
        setDraft('');
      } catch (err) {
        const message =
          err instanceof ApiError ? err.detail : 'No se pudo enviar el mensaje';
        setSendError(message);
      } finally {
        setSending(false);
      }
    },
    [canSend, detail, draft, threadId],
  );

  const messages = useMemo<ChatMessageData[]>(
    () => detail?.messages ?? [],
    [detail?.messages],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-tundra-bg text-white">
      {/* Header del hilo */}
      {detail && (
        <header className="px-6 py-4 border-b border-tundra-border bg-tundra-surface">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-tundra-gold mb-1">
                Cotización
              </p>
              <h3 className="font-display text-lg text-white truncate">
                {detail.user.first_name || 'Cliente'} ·{' '}
                <span className="text-white/40">
                  {ESTADO_LABEL[detail.estado] ?? detail.estado}
                </span>
              </h3>
            </div>
            <span
              className={[
                'inline-flex items-center px-2.5 py-1 rounded-full',
                'text-[10px] uppercase tracking-wider font-semibold',
                isTerminal
                  ? 'bg-white/5 text-white/40 border border-white/10'
                  : 'bg-tundra-gold/15 text-tundra-gold border border-tundra-gold/30',
              ].join(' ')}
            >
              {ESTADO_LABEL[detail.estado] ?? detail.estado}
            </span>
          </div>
        </header>
      )}

      {/* Lista de mensajes */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {error && !detail && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle size={36} className="text-tundra-danger" aria-hidden />
            <p className="text-white/60 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => void fetchThread()}
              className="px-4 py-2 rounded-lg border border-tundra-gold text-tundra-gold text-xs uppercase tracking-wider hover:bg-tundra-gold hover:text-black transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {!error && !detail && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 rounded-xl bg-white/5 animate-pulse"
                aria-hidden
              />
            ))}
          </div>
        )}

        {detail && messages.length === 0 && (
          <p className="text-center text-white/30 text-sm py-12">
            Aún no hay mensajes en este hilo.
          </p>
        )}

        {detail && user && (
          <>
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} currentUserId={user.id} />
            ))}
            <div ref={listEndRef} aria-hidden />
          </>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
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
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_INPUT))}
            onKeyDown={(e) => {
              // Enter para enviar, Shift+Enter salto de línea.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) void handleSubmit(e as unknown as FormEvent);
              }
            }}
            disabled={isTerminal || sending}
            placeholder={
              isTerminal
                ? `Hilo ${ESTADO_LABEL[detail?.estado ?? '']?.toLowerCase() ?? 'cerrado'}, no se pueden enviar mensajes`
                : 'Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)'
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
            disabled={!canSend}
            aria-label="Enviar mensaje"
            className={[
              'inline-flex items-center justify-center h-12 w-12 rounded-xl flex-shrink-0',
              'transition-all duration-200',
              canSend
                ? 'bg-tundra-gold text-black hover:bg-tundra-goldBright hover:shadow-[0_0_20px_-4px_rgba(250,204,21,0.6)]'
                : 'bg-white/5 text-white/20 cursor-not-allowed',
            ].join(' ')}
          >
            <Send size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-white/30 text-right">
          {draft.length} / {MAX_INPUT}
        </p>
      </form>
    </div>
  );
}
