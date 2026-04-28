/**
 * AdminApiKeysTab — generar/revocar API keys (FASE 8, archivo 10/12).
 *
 * Spec:
 * - Orquestor.md §FASE 8 — admin tab API Keys
 * - R3 Plain key se muestra UNA VEZ. Tras cerrar el modal, solo queda el hash.
 * - R13 Backend loguea create/revoke como warning (auditable).
 *
 * UX:
 * - Modal post-creación con plain key + botón "Copiar" + warning visible.
 * - Sin "cerrar accidental" — cierre requiere botón explícito tras copiar.
 * - Soft revoke (is_active=False) preserva la auditoría.
 */

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';

import {
  adminApi,
  type ApiKeyCreateBody,
  type ApiKeyCreatedResponse,
  type ApiKeyItem,
  type ApiKeyScope,
} from '../../services/api';

const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  read: 'Lectura',
  write: 'Escritura',
  admin: 'Admin',
};

export function AdminApiKeysTab(): JSX.Element {
  const [items, setItems] = useState<ApiKeyItem[] | null>(null);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreatedResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      const res = await adminApi.listApiKeys(includeRevoked);
      setItems(res.items);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error cargando API keys');
    }
  };

  useEffect(() => {
    void refresh();
  }, [includeRevoked]);

  const handleRevoke = async (key: ApiKeyItem): Promise<void> => {
    if (
      !window.confirm(
        `¿Revocar la API key "${key.name}"?\nEsto desactiva la clave para todas las requests futuras.`,
      )
    )
      return;
    setBusyId(key.id);
    try {
      await adminApi.revokeApiKey(key.id);
      await refresh();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error al revocar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-tundra-gold">API Keys</h2>
          <p className="text-xs uppercase tracking-wider text-white/40">
            {items === null ? '…' : `${items.length} keys`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/50 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRevoked}
              onChange={(e) => setIncludeRevoked(e.target.checked)}
            />
            Incluir revocadas
          </label>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wider text-white/60 border border-tundra-border rounded-md hover:text-white hover:border-white/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva key
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-tundra-border">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="text-left px-4 py-3 font-normal">Nombre</th>
              <th className="text-left px-4 py-3 font-normal">Scopes</th>
              <th className="text-left px-4 py-3 font-normal">Último uso</th>
              <th className="text-left px-4 py-3 font-normal">Expira</th>
              <th className="text-center px-4 py-3 font-normal">Estado</th>
              <th className="text-right px-4 py-3 font-normal">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tundra-border">
            {items === null ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/30">
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/30">
                  Sin API keys.
                </td>
              </tr>
            ) : (
              items.map((k) => (
                <tr key={k.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-tundra-gold" />
                      {k.name}
                    </div>
                    <div className="font-mono text-[10px] text-white/40">
                      {k.id.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <span
                          key={s}
                          className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] uppercase tracking-wider text-white/60"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs">
                    {k.last_used_at
                      ? new Date(k.last_used_at).toLocaleString()
                      : 'Nunca'}
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs">
                    {k.expires_at
                      ? new Date(k.expires_at).toLocaleDateString()
                      : 'Nunca'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={[
                        'inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider',
                        k.is_usable
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : k.is_active
                            ? 'bg-yellow-500/10 text-yellow-300'
                            : 'bg-white/5 text-white/40',
                      ].join(' ')}
                    >
                      {k.is_usable
                        ? 'Activa'
                        : k.is_active
                          ? 'Expirada'
                          : 'Revocada'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleRevoke(k)}
                        disabled={!k.is_active || busyId === k.id}
                        className="p-1.5 text-white/50 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Revocar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <CreateKeyForm
          onClose={() => setShowForm(false)}
          onCreated={async (resp) => {
            setShowForm(false);
            setCreated(resp);
            await refresh();
          }}
        />
      )}

      {created && (
        <PlainKeyModal
          payload={created}
          onClose={() => setCreated(null)}
        />
      )}
    </section>
  );
}

// ─── Create form ────────────────────────────────────────────────────────

interface CreateProps {
  onClose: () => void;
  onCreated: (resp: ApiKeyCreatedResponse) => void | Promise<void>;
}

function CreateKeyForm({ onClose, onCreated }: CreateProps): JSX.Element {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleScope = (s: ApiKeyScope): void => {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (name.trim().length < 3) {
      setError('Nombre debe tener al menos 3 caracteres');
      return;
    }
    if (scopes.length === 0) {
      setError('Selecciona al menos un scope');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: ApiKeyCreateBody = {
        name: name.trim(),
        scopes,
        expires_at: expiresAt
          ? new Date(expiresAt).toISOString()
          : null,
      };
      const resp = await adminApi.createApiKey(body);
      await onCreated(resp);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error al crear key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-tundra-bg border border-tundra-border rounded-lg p-6 flex flex-col gap-4"
      >
        <h3 className="font-display text-lg text-tundra-gold">Nueva API Key</h3>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Nombre identificador
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Ej: Integración facturación"
            required
            className="px-3 py-2 bg-black/40 border border-tundra-border rounded-md text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-tundra-gold"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Scopes
          </span>
          <div className="flex gap-2">
            {(Object.keys(SCOPE_LABEL) as ApiKeyScope[]).map((s) => {
              const active = scopes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleScope(s)}
                  className={[
                    'flex-1 px-3 py-2 text-xs uppercase tracking-wider rounded-md border transition-colors',
                    active
                      ? 'bg-tundra-gold/10 border-tundra-gold text-tundra-gold'
                      : 'border-tundra-border text-white/50 hover:text-white',
                  ].join(' ')}
                >
                  {SCOPE_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Expira (opcional)
          </span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="px-3 py-2 bg-black/40 border border-tundra-border rounded-md text-sm text-white focus:outline-none focus:border-tundra-gold"
          />
        </label>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs uppercase tracking-wider text-white/60 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300 disabled:opacity-50"
          >
            {busy ? 'Generando…' : 'Generar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── One-time plain key modal ───────────────────────────────────────────

interface PlainKeyModalProps {
  payload: ApiKeyCreatedResponse;
  onClose: () => void;
}

function PlainKeyModal({ payload, onClose }: PlainKeyModalProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(payload.plain_key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select-all si clipboard API falla.
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-tundra-bg border-2 border-tundra-gold rounded-lg p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-tundra-gold flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-display text-lg text-tundra-gold">
              Copia esta clave AHORA
            </h3>
            <p className="text-xs uppercase tracking-wider text-white/50 mt-1">
              Por seguridad, no se mostrará de nuevo. Si la pierdes, debes
              generar una nueva.
            </p>
          </div>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Identificador
          </span>
          <div className="text-white font-medium">{payload.api_key.name}</div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Plain key (sólo visible esta vez)
          </span>
          <div className="flex items-stretch gap-0">
            <code className="flex-1 px-3 py-2.5 bg-black/60 border border-tundra-border rounded-l-md text-xs font-mono text-tundra-gold break-all">
              {payload.plain_key}
            </code>
            <button
              onClick={copy}
              className="px-4 bg-tundra-gold text-black rounded-r-md text-xs uppercase tracking-wider font-semibold hover:bg-yellow-300 flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>

        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-300/90">
          Guárdala en tu password manager o variable de entorno. El backend
          solo conserva el hash SHA-256 — ni siquiera nosotros podemos
          recuperarla.
        </div>

        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmedSaved}
            onChange={(e) => setConfirmedSaved(e.target.checked)}
          />
          Confirmo que copié la clave en un lugar seguro
        </label>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            disabled={!confirmedSaved}
            className="px-4 py-2 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
