/**
 * WebSocketContext — single global WebSocket connection (R7).
 *
 * Spec:
 *   - Orquestor.md §FASE 5
 *   - R7 Una conexión por usuario, heartbeat 30s, timeout 120s,
 *        reconexión exponencial (1s → 2s → 4s → 8s → 16s → 30s tope).
 *   - R2 No `any`. Eventos tipados.
 *
 * API:
 *   const { status, subscribe, subscribeThread, unsubscribeThread } = useWS();
 *
 *   subscribe('chat_message', (payload) => { ... });
 *   subscribeThread(threadId);
 *
 * Patrón:
 *   - Listeners: Map<event_type, Set<callback>>.
 *   - Auto-reconect cuando hay user autenticado y la conexión se cae.
 *   - Pausa la reconexión si el user hace logout (status='anonymous').
 */

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { tokenStorage } from '../services/api';
import { useAuth } from './AuthContext';

// ─── Tipos ────────────────────────────────────────────────────────────────

export type WSStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export type WSEventType =
  | 'pong'
  | 'heartbeat'
  | 'notification'
  | 'chat_message'
  | 'thread_updated'
  | 'ticket_updated'
  | 'session_replaced'
  | 'subscribed'
  | 'unsubscribed'
  | 'error';

export interface WSMessage {
  type: WSEventType | string;
  payload: Record<string, unknown>;
}

export type WSListener = (payload: Record<string, unknown>) => void;

export interface WSContextValue {
  status: WSStatus;
  /** Suscríbete a un tipo de evento. Devuelve una función de cleanup. */
  subscribe: (event: WSEventType | string, listener: WSListener) => () => void;
  /** Suscríbete a updates de un thread (chat real-time). */
  subscribeThread: (threadId: string) => void;
  unsubscribeThread: (threadId: string) => void;
  subscribeTicket: (ticketId: string) => void;
  unsubscribeTicket: (ticketId: string) => void;
  /** Fuerza un ping manual (útil para tests). */
  ping: () => void;
}

// ─── Config ───────────────────────────────────────────────────────────────

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host.replace(/:\d+$/, '')}:8000/ws`
    : 'ws://localhost:8000/ws');

const HEARTBEAT_MS = 30_000;
const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

// ─── Context ──────────────────────────────────────────────────────────────

const WSContext = createContext<WSContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────

interface WSProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WSProviderProps): JSX.Element {
  const { status: authStatus } = useAuth();
  const [status, setStatus] = useState<WSStatus>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<WSListener>>>(new Map());
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  // Subscripciones que el cliente quiere mantener tras reconectar:
  const desiredThreadsRef = useRef<Set<string>>(new Set());
  const desiredTicketsRef = useRef<Set<string>>(new Set());

  // ── Helpers ─────────────────────────────────────────────────────────────

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }, []);

  const dispatchMessage = useCallback((data: WSMessage) => {
    const set = listenersRef.current.get(data.type);
    if (!set || set.size === 0) return;
    // Snapshot para que un listener que se desuscribe en pleno dispatch
    // no rompa el iterador.
    for (const fn of [...set]) {
      try {
        fn(data.payload ?? {});
      } catch {
        // Listener buggy no debe tumbar el contexto.
      }
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // ── Connect ─────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (authStatus !== 'authenticated') return;
    const token = tokenStorage.getAccess();
    if (!token) return;

    intentionalCloseRef.current = false;
    setStatus(reconnectAttemptsRef.current === 0 ? 'connecting' : 'reconnecting');

    const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setStatus('open');
      // Re-subscribe a los recursos que el usuario tenía antes de la caída.
      for (const id of desiredThreadsRef.current) {
        send({ action: 'subscribe_thread', thread_id: id });
      }
      for (const id of desiredTicketsRef.current) {
        send({ action: 'subscribe_ticket', ticket_id: id });
      }
      // Ping inicial para confirmar latencia.
      send({ action: 'ping' });
      // Heartbeat periódico.
      if (heartbeatTimerRef.current === null) {
        heartbeatTimerRef.current = window.setInterval(() => {
          send({ action: 'ping' });
        }, HEARTBEAT_MS);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage;
        if (data && typeof data.type === 'string') {
          dispatchMessage(data);
        }
      } catch {
        // mensaje malformado del server — ignorar
      }
    };

    ws.onclose = (event) => {
      clearTimers();
      wsRef.current = null;
      // Cierre intencional (logout, unmount) → no reconectar.
      if (intentionalCloseRef.current) {
        setStatus('closed');
        return;
      }
      // session_replaced (4000) → no reconectar (otra ventana se conectó).
      if (event.code === 4000) {
        setStatus('closed');
        return;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      // Los errores se manifiestan también en onclose; no duplicamos lógica.
    };
  }, [authStatus, dispatchMessage, send]);

  const scheduleReconnect = useCallback(() => {
    setStatus('reconnecting');
    const idx = Math.min(
      reconnectAttemptsRef.current,
      BACKOFF_STEPS_MS.length - 1,
    );
    const delay = BACKOFF_STEPS_MS[idx];
    reconnectAttemptsRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  // ── Lifecycle según authStatus ──────────────────────────────────────────

  useEffect(() => {
    if (authStatus === 'authenticated') {
      // Reset y conectar.
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      // Cierre limpio si nos deslogueamos.
      intentionalCloseRef.current = true;
      clearTimers();
      reconnectAttemptsRef.current = 0;
      desiredThreadsRef.current.clear();
      desiredTicketsRef.current.clear();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Logout');
      }
      wsRef.current = null;
      setStatus('idle');
    }

    return () => {
      // Cleanup al desmontar el provider entero.
      intentionalCloseRef.current = true;
      clearTimers();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Provider unmount');
      }
      wsRef.current = null;
    };
  }, [authStatus, connect, clearTimers]);

  // ── API expuesta ────────────────────────────────────────────────────────

  const subscribe = useCallback(
    (event: WSEventType | string, listener: WSListener) => {
      let set = listenersRef.current.get(event);
      if (!set) {
        set = new Set();
        listenersRef.current.set(event, set);
      }
      set.add(listener);
      return () => {
        const s = listenersRef.current.get(event);
        if (s) {
          s.delete(listener);
          if (s.size === 0) listenersRef.current.delete(event);
        }
      };
    },
    [],
  );

  const subscribeThread = useCallback(
    (threadId: string) => {
      desiredThreadsRef.current.add(threadId);
      send({ action: 'subscribe_thread', thread_id: threadId });
    },
    [send],
  );

  const unsubscribeThread = useCallback(
    (threadId: string) => {
      desiredThreadsRef.current.delete(threadId);
      send({ action: 'unsubscribe_thread', thread_id: threadId });
    },
    [send],
  );

  const subscribeTicket = useCallback(
    (ticketId: string) => {
      desiredTicketsRef.current.add(ticketId);
      send({ action: 'subscribe_ticket', ticket_id: ticketId });
    },
    [send],
  );

  const unsubscribeTicket = useCallback(
    (ticketId: string) => {
      desiredTicketsRef.current.delete(ticketId);
      send({ action: 'unsubscribe_ticket', ticket_id: ticketId });
    },
    [send],
  );

  const ping = useCallback(() => {
    send({ action: 'ping' });
  }, [send]);

  const value = useMemo<WSContextValue>(
    () => ({
      status,
      subscribe,
      subscribeThread,
      unsubscribeThread,
      subscribeTicket,
      unsubscribeTicket,
      ping,
    }),
    [
      status,
      subscribe,
      subscribeThread,
      unsubscribeThread,
      subscribeTicket,
      unsubscribeTicket,
      ping,
    ],
  );

  return <WSContext.Provider value={value}>{children}</WSContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useWebSocket(): WSContextValue {
  const ctx = useContext(WSContext);
  if (ctx === null) {
    throw new Error('useWebSocket must be used inside <WebSocketProvider>');
  }
  return ctx;
}
