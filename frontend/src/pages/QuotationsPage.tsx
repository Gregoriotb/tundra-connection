/**
 * QuotationsPage — pantalla full con sidebar de hilos + chat activo.
 *
 * Spec:
 *   - Orquestor.md §FASE 4
 *   - R2 No `any`
 *   - R3 Auth requerida — la página redirige al login si está anónimo.
 *
 * Layout:
 *   - Desktop: 2 columnas (sidebar 320px + chat).
 *   - Mobile: una columna a la vez (lista → seleccionar → chat) con
 *     botón "back" para volver a la lista.
 *
 * En FASE 5 cuando lleguen las notificaciones por WebSocket, el polling
 * de la sidebar se reemplaza por un push del WSContext.
 */

import { ArrowLeft, MessageCircleMore, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ChatThread } from '../components/ChatThread';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, chatApi, type QuotationThread } from '../services/api';
import type { UUID } from '../types';

const SIDEBAR_POLL_MS = 15_000;
const ESTADO_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  quoted: 'Cotizado',
  negotiating: 'Negociando',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

interface QuotationsPageProps {
  /** Callback para iniciar un hilo nuevo (lleva al landing/overlay). */
  onStartNew: () => void;
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: QuotationThread[] };

// ─── Helpers ──────────────────────────────────────────────────────────────

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

// ─── Subcomponente: ítem de la sidebar ────────────────────────────────────

interface ThreadListItemProps {
  thread: QuotationThread;
  active: boolean;
  onSelect: (id: UUID) => void;
}

function ThreadListItem({
  thread,
  active,
  onSelect,
}: ThreadListItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(thread.id)}
      className={[
        'w-full text-left p-4 rounded-xl border transition-all duration-200',
        active
          ? 'bg-tundra-gold/10 border-tundra-gold'
          : 'bg-tundra-surface border-white/5 hover:border-tundra-gold/30',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span
          className={[
            'inline-flex items-center px-2 py-0.5 rounded-full',
            'text-[9px] uppercase tracking-wider font-semibold',
            thread.estado === 'closed' || thread.estado === 'cancelled'
              ? 'bg-white/5 text-white/40'
              : 'bg-tundra-gold/15 text-tundra-gold',
          ].join(' ')}
        >
          {ESTADO_LABEL[thread.estado] ?? thread.estado}
        </span>
        <span className="text-[10px] text-white/30 flex-shrink-0">
          {relativeTime(thread.updated_at)}
        </span>
      </div>

      <p className="text-sm text-white truncate font-medium mb-0.5">
        {thread.requerimiento_inicial?.split('\n')[0] ?? 'Cotización'}
      </p>

      {thread.last_message_preview && (
        <p className="text-xs text-white/40 truncate">
          {thread.last_message_preview}
        </p>
      )}

      {thread.unread_count > 0 && (
        <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-tundra-goldBright text-black text-[10px] font-bold">
          {thread.unread_count} nuevo{thread.unread_count !== 1 && 's'}
        </span>
      )}
    </button>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────

export function QuotationsPage({ onStartNew }: QuotationsPageProps): JSX.Element {
  const { status: authStatus } = useAuth();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [activeId, setActiveId] = useState<UUID | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await chatApi.myThreads();
      setList({ status: 'ready', items: res.items });
      // Auto-seleccionar el primero solo en el load inicial.
      setActiveId((prev) => prev ?? res.items[0]?.id ?? null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudieron cargar los hilos';
      setList({ status: 'error', message });
    }
  }, []);

  // Carga inicial.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadList();
  }, [authStatus, loadList]);

  // Polling de la sidebar (en FASE 5: WebSocket push).
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const id = window.setInterval(() => {
      void loadList();
    }, SIDEBAR_POLL_MS);
    return () => window.clearInterval(id);
  }, [authStatus, loadList]);

  const items = useMemo<QuotationThread[]>(
    () => (list.status === 'ready' ? list.items : []),
    [list],
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
          <MessageCircleMore size={48} className="mx-auto text-tundra-gold mb-4" aria-hidden />
          <h2 className="font-display text-2xl mb-3">Inicia sesión para cotizar</h2>
          <p className="text-white/50 text-sm">
            Necesitas tu cuenta para mantener un historial de cotizaciones y
            conversar con nuestro equipo.
          </p>
        </div>
      </div>
    );
  }

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
        <header className="flex items-center justify-between px-5 py-4 border-b border-tundra-border bg-tundra-surface">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-tundra-gold">
              Mis cotizaciones
            </p>
            <h1 className="font-display text-lg">Servicios técnicos</h1>
          </div>
          <button
            type="button"
            onClick={onStartNew}
            aria-label="Nueva cotización"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-tundra-gold text-black hover:bg-tundra-goldBright transition-colors"
          >
            <Plus size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {list.status === 'loading' && (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-white/5 animate-pulse"
                  aria-hidden
                />
              ))}
            </>
          )}

          {list.status === 'error' && (
            <div className="p-4 text-center text-white/50 text-sm">
              <p>{list.message}</p>
              <button
                type="button"
                onClick={() => void loadList()}
                className="mt-3 text-xs uppercase tracking-wider text-tundra-gold hover:text-tundra-goldBright"
              >
                Reintentar
              </button>
            </div>
          )}

          {list.status === 'ready' && items.length === 0 && (
            <div className="p-6 text-center">
              <MessageCircleMore
                size={36}
                className="mx-auto text-white/20 mb-3"
                aria-hidden
              />
              <p className="text-white/40 text-sm mb-4">
                Aún no tienes cotizaciones.
              </p>
              <button
                type="button"
                onClick={onStartNew}
                className="px-4 py-2 rounded-lg border border-tundra-gold text-tundra-gold text-xs uppercase tracking-wider hover:bg-tundra-gold hover:text-black transition-colors"
              >
                Iniciar la primera
              </button>
            </div>
          )}

          {list.status === 'ready' &&
            items.map((t) => (
              <ThreadListItem
                key={t.id}
                thread={t}
                active={t.id === activeId}
                onSelect={setActiveId}
              />
            ))}
        </div>
      </aside>

      {/* Chat activo */}
      <section
        className={[
          'flex-1 flex flex-col',
          activeId ? 'flex' : 'hidden lg:flex',
        ].join(' ')}
      >
        {/* Botón back en mobile */}
        {activeId && (
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="lg:hidden flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-wider text-tundra-gold border-b border-tundra-border bg-tundra-surface"
          >
            <ArrowLeft size={14} aria-hidden />
            Volver a la lista
          </button>
        )}

        {activeId ? (
          <ChatThread threadId={activeId} />
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center text-center px-6">
            <div className="max-w-sm">
              <MessageCircleMore
                size={48}
                className="mx-auto text-white/20 mb-4"
                aria-hidden
              />
              <p className="text-white/40 text-sm">
                Selecciona una cotización a la izquierda para verla.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
