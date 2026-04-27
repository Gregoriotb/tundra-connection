/**
 * AuthContext — estado global de autenticación.
 *
 * Spec:
 *   - Orquestor.md §FASE 1
 *   - R2 No `any`. Tipos importados de ../types
 *   - R3 JWT Bearer (login/register guardan tokens y traen User)
 *   - Soporte explícito para el bootstrap "admin" (login con identifier "admin")
 *
 * Flujo:
 *   1. Al montar, si hay access_token en localStorage → llama /auth/verify.
 *   2. login/register persisten tokens y user.
 *   3. Si el backend responde 401 en cualquier request, el cliente axios
 *      limpia tokens y este contexto recibe el evento via
 *      registerUnauthorizedHandler → setUser(null).
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

import {
  ApiError,
  authApi,
  registerUnauthorizedHandler,
  tokenStorage,
} from '../services/api';
import type { LoginPayload, RegisterPayload, User } from '../types';

// ─── Shape ────────────────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  isAdmin: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const handlerRegistered = useRef(false);

  // Cuando axios detecta un 401, limpia tokens y nos avisa.
  useEffect(() => {
    if (handlerRegistered.current) return;
    handlerRegistered.current = true;
    registerUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });
  }, []);

  // Boot inicial: si hay token guardado, intenta /auth/verify.
  useEffect(() => {
    const token = tokenStorage.getAccess();
    if (!token) {
      setStatus('anonymous');
      return;
    }
    let cancelled = false;
    authApi
      .verify()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        tokenStorage.clear();
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<User> => {
    const tokens = await authApi.login(payload);
    tokenStorage.set(tokens);
    setUser(tokens.user);
    setStatus('authenticated');
    return tokens.user;
  }, []);

  const register = useCallback(
    async (payload: RegisterPayload): Promise<User> => {
      const tokens = await authApi.register(payload);
      tokenStorage.set(tokens);
      setUser(tokens.user);
      setStatus('authenticated');
      return tokens.user;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch (err) {
      // Si el server rechaza el logout (token ya inválido), no bloqueamos al user.
      if (!(err instanceof ApiError) || err.status !== 401) {
        // Cualquier error inesperado se loggea pero no interrumpe el flujo.
        console.error('logout failed', err);
      }
    } finally {
      tokenStorage.clear();
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const refresh = useCallback(async (): Promise<User | null> => {
    if (!tokenStorage.getAccess()) return null;
    try {
      const u = await authApi.verify();
      setUser(u);
      setStatus('authenticated');
      return u;
    } catch {
      tokenStorage.clear();
      setUser(null);
      setStatus('anonymous');
      return null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAdmin: user?.is_admin ?? false,
      login,
      register,
      logout,
      refresh,
    }),
    [status, user, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
