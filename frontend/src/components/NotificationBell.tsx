/**
 * NotificationBell — bell icon con badge + dropdown de notificaciones.
 *
 * Spec:
 *   - Orquestor.md §FASE 5
 *   - R2 No `any`. Tipos importados de services/api.
 *   - R10 Sin polling — primer fetch al montar + push via WebSocket.
 *
 * Comportamiento:
 *   - Fetch inicial cuando el user se autentica.
 *   - Listener WS 'notification' → prepend nueva + incrementa unread.
 *   - Click bell → toggle dropdown.
 *   - Click fuera → cierra.
 *   - Click notificación → mark-read individual + cierra dropdown.
 *   - Botón "Marcar todas" → mark-all-read.
 */

import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  FileText,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
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
  notificationsApi,
  type Notification,
  type NotificationTipo,
} from '../services/api';

// ─── Helpers visuales ─────────────────────────────────────────────────────

const TIPO_ICON: Record<NotificationTipo, LucideIcon> = {
  chat_message: MessageSquare,
  quotation_status: Sparkles,
  invoice_created: FileText,
  ticket_updated: ShieldAlert,
  ticket_assigned: ShieldAlert,
};

const TIPO_LABEL: Record<NotificationTipo, string> = {
  chat_message: 'Mensaje nuevo',
  quotation_status: 'Cotización actualizada',
  invoice_created: 'Factura emitida',
  ticket_updated: 'Reporte actualizado',
  ticket_assigned: 'Reporte asignado',
};

function notificationTitle(n: Notification): string {
  return TIPO_LABEL[n.tipo] ?? 'Notificación';
}

function notificationPreview(n: Notification): string {
  const p = n.payload;
  // Best-effort según tipo. El payload es Record<string, unknown> por R2.
  const candidates = ['preview', 'message', 'titulo', 'estado', 'detail'];
  for (const key of candidates) {
    const v = p[key];
    if (typeof v === 'string' && v.length > 0) {
      return v.length > 80 ? `${v.slice(0, 79)}…` : v;
    }
  }
  return '';
}

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

// ─── Component ────────────────────────────────────────────────────────────

interface NotificationBellProps {
  onSelect?: (notification: Notification) => void;
}

export function NotificationBell({ onSelect }: NotificationBellProps): JSX.Element | null {
  const { status: authStatus } = useAuth();
  const { subscribe, status: wsStatus } = useWebSocket();

  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // ── Fetch inicial ──────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        notificationsApi.list(false, 50),
        notificationsApi.unreadCount(),
      ]);
      setItems(list.items);
      setUnread(count.unread);
    } catch (err) {
      // Silencioso — el bell no debe gritar errores; en peor caso queda en 0.
      if (!(err instanceof ApiError)) {
        // eslint-disable-next-line no-console
        console.error('notificationsBell.refresh', err);
      }
    }
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setItems([]);
      setUnread(0);
      return;
    }
    void refresh();
  }, [authStatus, refresh]);

  // ── Listener WS 'notification' ─────────────────────────────────────────
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const cleanup = subscribe('notification', (payload) => {
      // El backend manda la notificación serializada como payload directo.
      const n = payload as unknown as Notification;
      if (!n || typeof n.id !== 'string') return;
      setItems((prev) => {
        // Evita duplicados si el evento llega dos veces.
        if (prev.some((p) => p.id === n.id)) return prev;
        return [n, ...prev].slice(0, 100);
      });
      if (!n.is_read) setUnread((u) => u + 1);
    });
    return cleanup;
  }, [authStatus, subscribe]);

  // ── Re-sync al reconectar ──────────────────────────────────────────────
  useEffect(() => {
    if (wsStatus === 'open') {
      void refresh();
    }
  }, [wsStatus, refresh]);

  // ── Click fuera cierra ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        dropdownRef.current &&
        e.target instanceof Node &&
        !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [open]);

  // ── Acciones ───────────────────────────────────────────────────────────
  const handleClickItem = useCallback(
    async (n: Notification) => {
      setOpen(false);
      onSelect?.(n);
      if (n.is_read) return;
      // Optimista
      setItems((prev) =>
        prev.map((p) =>
          p.id === n.id
            ? { ...p, is_read: true, read_at: new Date().toISOString() }
            : p,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
      try {
        await notificationsApi.markRead(n.id);
      } catch {
        // Si falló, refresca para volver al estado de servidor.
        void refresh();
      }
    },
    [onSelect, refresh],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (unread === 0) return;
    const previous = items;
    const previousUnread = unread;
    // Optimista
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((p) =>
        p.is_read ? p : { ...p, is_read: true, read_at: now },
      ),
    );
    setUnread(0);
    try {
      await notificationsApi.markAllRead();
    } catch {
      setItems(previous);
      setUnread(previousUnread);
    }
  }, [items, unread]);

  // ── Auth gate ──────────────────────────────────────────────────────────
  if (authStatus !== 'authenticated') {
    return null;
  }

  const visibleItems = useMemo(() => items.slice(0, 50), [items]);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notificaciones${unread > 0 ? `, ${unread} sin leer` : ''}`}
        aria-expanded={open}
        className={[
          'relative inline-flex items-center justify-center h-10 w-10 rounded-lg',
          'text-white/60 hover:text-white hover:bg-white/5',
          'transition-colors',
          open && 'bg-white/5 text-white',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Bell size={20} strokeWidth={1.8} aria-hidden />
        {unread > 0 && (
          <span
            className={[
              'absolute top-1 right-1 inline-flex items-center justify-center',
              'min-w-[18px] h-[18px] px-1 rounded-full',
              'bg-tundra-danger text-white text-[10px] font-bold',
              'border-2 border-tundra-bg',
            ].join(' ')}
            aria-hidden
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={[
              'absolute right-0 top-12 z-50 w-[360px] max-w-[92vw]',
              'rounded-2xl bg-tundra-surface border border-tundra-border',
              'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]',
              'overflow-hidden',
            ].join(' ')}
            role="dialog"
            aria-label="Notificaciones"
          >
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-tundra-gold" aria-hidden />
                <h3 className="font-display text-sm">Notificaciones</h3>
                {wsStatus === 'open' && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-tundra-success" aria-label="Conectado en tiempo real" />
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-tundra-gold hover:text-tundra-goldBright transition-colors"
                  >
                    <CheckCheck size={12} aria-hidden />
                    Marcar todas
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </header>

            {/* Lista */}
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {visibleItems.length === 0 ? (
                <p className="px-4 py-12 text-center text-white/30 text-xs">
                  Sin notificaciones aún.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {visibleItems.map((n) => {
                    const Icon = TIPO_ICON[n.tipo] ?? Bell;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => void handleClickItem(n)}
                          className={[
                            'w-full text-left flex gap-3 px-4 py-3 transition-colors',
                            n.is_read
                              ? 'hover:bg-white/5'
                              : 'bg-tundra-gold/5 hover:bg-tundra-gold/10',
                          ].join(' ')}
                        >
                          <div
                            className={[
                              'flex-shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg',
                              n.is_read
                                ? 'bg-white/5 text-white/40'
                                : 'bg-tundra-gold/15 text-tundra-gold',
                            ].join(' ')}
                          >
                            <Icon size={16} strokeWidth={2} aria-hidden />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2 mb-0.5">
                              <p className="text-sm text-white truncate font-medium">
                                {notificationTitle(n)}
                              </p>
                              <span className="text-[10px] text-white/30 flex-shrink-0">
                                {relativeTime(n.created_at)}
                              </span>
                            </div>
                            {notificationPreview(n) && (
                              <p className="text-xs text-white/50 line-clamp-2">
                                {notificationPreview(n)}
                              </p>
                            )}
                          </div>
                          {!n.is_read && (
                            <span
                              className="flex-shrink-0 w-2 h-2 rounded-full bg-tundra-goldBright mt-2"
                              aria-label="Sin leer"
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
