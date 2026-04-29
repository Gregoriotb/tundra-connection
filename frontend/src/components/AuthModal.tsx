/**
 * AuthModal — login + register modal.
 *
 * Spec:
 * - Soporta el bootstrap admin: usuario "admin" + contraseña que se
 *   establece la primera vez. El backend lo maneja en /auth/login.
 * - Login normal: email + password.
 * - Register: email + password + nombre/apellido + tipo de cuenta.
 *
 * UX:
 * - Tabs Login/Register en el mismo modal.
 * - Mensajes de error inline (no alerts).
 * - Cierra al éxito + dispara `onSuccess` (parent refresca UI).
 */

import { useState } from 'react';
import { Lock, LogIn, UserPlus } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import type { AccountType } from '../types';

type Mode = 'login' | 'register';

interface AuthModalProps {
  initialMode?: Mode;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({
  initialMode = 'login',
  onClose,
  onSuccess,
}: AuthModalProps): JSX.Element {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-tundra-bg border border-tundra-border rounded-lg p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-tundra-border -mt-2 -mx-2">
          <TabButton
            active={mode === 'login'}
            onClick={() => setMode('login')}
            icon={<LogIn className="w-4 h-4" />}
            label="Iniciar sesión"
          />
          <TabButton
            active={mode === 'register'}
            onClick={() => setMode('register')}
            icon={<UserPlus className="w-4 h-4" />}
            label="Crear cuenta"
          />
          <button
            onClick={onClose}
            className="ml-auto px-3 text-xs uppercase tracking-wider text-white/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        {mode === 'login' ? (
          <LoginForm onSuccess={() => { onSuccess?.(); onClose(); }} />
        ) : (
          <RegisterForm onSuccess={() => { onSuccess?.(); onClose(); }} />
        )}
      </div>
    </div>
  );
}

// ─── Tab button ─────────────────────────────────────────────────────────

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-wider border-b-2 -mb-px transition-colors',
        active
          ? 'text-tundra-gold border-tundra-gold'
          : 'text-white/40 border-transparent hover:text-white/70',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Login form ─────────────────────────────────────────────────────────

function LoginForm({ onSuccess }: { onSuccess: () => void }): JSX.Element {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Completa email y contraseña');
      return;
    }
    setBusy(true);
    try {
      await login({ email: identifier.trim() as never, password });
      onSuccess();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Credenciales inválidas');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl text-tundra-gold">
          Bienvenido de nuevo
        </h2>
        <p className="text-xs text-white/40 uppercase tracking-wider">
          Si eres admin, usa <code className="text-tundra-gold/80">admin</code> como identificador.
        </p>
      </div>

      <Field label="Email o identificador">
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoFocus
          placeholder="tu@email.com"
          className={inputCls}
        />
      </Field>

      <Field label="Contraseña">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
          className={inputCls}
        />
      </Field>

      {error && <ErrorBox message={error} />}

      <button
        type="submit"
        disabled={busy}
        className="w-full px-4 py-3 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Lock className="w-3.5 h-3.5" />
        {busy ? 'Verificando…' : 'Entrar'}
      </button>
    </form>
  );
}

// ─── Register form ──────────────────────────────────────────────────────

function RegisterForm({ onSuccess }: { onSuccess: () => void }): JSX.Element {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Email inválido');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setBusy(true);
    try {
      await register({
        email: email.trim().toLowerCase(),
        password,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        account_type: accountType,
      });
      onSuccess();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'No se pudo crear la cuenta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
      <h2 className="font-display text-2xl text-tundra-gold">Crea tu cuenta</h2>

      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          placeholder="tu@email.com"
          className={inputCls}
        />
      </Field>

      <Field label="Contraseña (mín. 8 caracteres)">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            className={inputCls}
          />
        </Field>
        <Field label="Apellido">
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Tipo de cuenta">
        <div className="grid grid-cols-2 gap-2">
          {(['personal', 'empresa'] as AccountType[]).map((t) => {
            const active = accountType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setAccountType(t)}
                className={[
                  'px-3 py-2 text-xs uppercase tracking-wider rounded-md border transition-colors',
                  active
                    ? 'bg-tundra-gold/10 border-tundra-gold text-tundra-gold'
                    : 'border-tundra-border text-white/50 hover:text-white',
                ].join(' ')}
              >
                {t === 'personal' ? 'Personal' : 'Empresa'}
              </button>
            );
          })}
        </div>
      </Field>

      {error && <ErrorBox message={error} />}

      <button
        type="submit"
        disabled={busy}
        className="w-full px-4 py-3 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <UserPlus className="w-3.5 h-3.5" />
        {busy ? 'Creando…' : 'Crear cuenta'}
      </button>

      <p className="text-[10px] text-white/30 text-center">
        Al crear tu cuenta aceptas las políticas de uso de Tundra Connection.
      </p>
    </form>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}

function ErrorBox({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
      {message}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2.5 bg-black/40 border border-tundra-border rounded-md text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-tundra-gold';
