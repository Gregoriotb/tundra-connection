/**
 * MonitoringView — vista de dashboards Grafana en el panel admin (FASE 9).
 *
 * Spec:
 * - Orquestor.md §FASE 9
 * - Grafana SELF-HOSTED. Hoy: iframe directo al `url_embed`.
 *   FASE 11 sweep: cambia a `/admin/grafana/{id}/proxy` con auth header.
 *
 * Funcionalidad:
 * - Lista los dashboards activos ordenados por `display_order`
 * - Cada dashboard se renderiza con `GrafanaEmbed`
 * - Modal de gestión (admin only): crear/editar/desactivar
 *
 * Empty state: instrucciones para registrar el primer dashboard
 * (incluye recordatorio del CSP/X-Frame-Options self-hosted).
 */

import { useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import {
  grafanaApi,
  type GrafanaDashboard,
  type GrafanaDashboardCreateBody,
  type GrafanaDashboardUpdateBody,
} from '../services/api';
import { GrafanaEmbed } from './GrafanaEmbed';

export function MonitoringView(): JSX.Element {
  const [items, setItems] = useState<GrafanaDashboard[] | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GrafanaDashboard | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      const res = await grafanaApi.list(includeInactive);
      setItems(res.items);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error cargando dashboards');
    }
  };

  useEffect(() => {
    void refresh();
  }, [includeInactive]);

  const handleDelete = async (d: GrafanaDashboard): Promise<void> => {
    if (!window.confirm(`¿Desactivar "${d.name}"?`)) return;
    setBusyId(d.id);
    try {
      await grafanaApi.remove(d.id);
      await refresh();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error al desactivar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-tundra-gold">
            Dashboards Grafana (self-hosted)
          </h3>
          <p className="text-xs text-white/40">
            {items === null ? '…' : `${items.length} dashboards`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/50 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Incluir inactivos
          </label>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wider text-white/60 border border-tundra-border rounded-md hover:text-white hover:border-white/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300"
          >
            <Plus className="w-3.5 h-3.5" /> Registrar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {items !== null && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-tundra-border bg-white/[0.01] px-6 py-10 flex flex-col items-center gap-3 text-center">
          <span className="font-display text-sm text-white/50">
            No hay dashboards registrados
          </span>
          <p className="text-xs text-white/30 max-w-md">
            Registra un dashboard pegando el URL embed de tu instancia
            Grafana self-hosted. Recuerda permitir el dominio del frontend
            en <code className="text-tundra-gold/80">grafana.ini</code>{' '}
            (X-Frame-Options + CORS).
          </p>
        </div>
      )}

      {/* ── Lista de dashboards ──────────────────────────────────────── */}
      {items !== null && items.length > 0 && (
        <div className="flex flex-col gap-6">
          {items.map((d) => (
            <div key={d.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      'inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider',
                      d.is_active
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-white/5 text-white/40',
                    ].join(' ')}
                  >
                    {d.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                  <span className="font-mono text-[10px] text-white/40">
                    uid: {d.uid} · order: {d.display_order}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(d);
                      setShowForm(true);
                    }}
                    className="p-1.5 text-white/50 hover:text-tundra-gold"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(d)}
                    disabled={!d.is_active || busyId === d.id}
                    className="p-1.5 text-white/50 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Desactivar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {d.is_active ? (
                <GrafanaEmbed
                  urlEmbed={d.url_embed}
                  name={d.name}
                  height={420}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-tundra-border bg-white/[0.01] px-6 py-8 text-center text-xs uppercase tracking-wider text-white/30">
                  {d.name} — inactivo
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DashboardForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setShowForm(false);
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

// ─── Modal form ─────────────────────────────────────────────────────────

interface FormProps {
  initial: GrafanaDashboard | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function DashboardForm({ initial, onClose, onSaved }: FormProps): JSX.Element {
  const isEdit = initial !== null;
  const [name, setName] = useState(initial?.name ?? '');
  const [uid, setUid] = useState(initial?.uid ?? '');
  const [urlEmbed, setUrlEmbed] = useState(initial?.url_embed ?? '');
  const [displayOrder, setDisplayOrder] = useState<number>(
    initial?.display_order ?? 0,
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Nombre demasiado corto');
      return;
    }
    if (!isEdit && !/^[A-Za-z0-9_-]+$/.test(uid)) {
      setError('UID solo permite letras, números, guion y underscore');
      return;
    }
    if (!/^https?:\/\//i.test(urlEmbed)) {
      setError('URL debe empezar con http:// o https://');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit && initial) {
        const body: GrafanaDashboardUpdateBody = {
          name: name.trim(),
          url_embed: urlEmbed.trim(),
          display_order: displayOrder,
          is_active: isActive,
        };
        await grafanaApi.update(initial.id, body);
      } else {
        const body: GrafanaDashboardCreateBody = {
          name: name.trim(),
          uid: uid.trim(),
          url_embed: urlEmbed.trim(),
          display_order: displayOrder,
          is_active: isActive,
        };
        await grafanaApi.create(body);
      }
      await onSaved();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error guardando dashboard');
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
        className="w-full max-w-lg bg-tundra-bg border border-tundra-border rounded-lg p-6 flex flex-col gap-4"
      >
        <h3 className="font-display text-lg text-tundra-gold">
          {isEdit ? 'Editar dashboard' : 'Registrar dashboard'}
        </h3>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Nombre
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            required
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            UID Grafana {isEdit && '(no editable)'}
          </span>
          <input
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            maxLength={100}
            disabled={isEdit}
            placeholder="abc123-uid"
            required
            className={[inputCls, isEdit ? 'opacity-50' : ''].join(' ')}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            URL embed
          </span>
          <input
            value={urlEmbed}
            onChange={(e) => setUrlEmbed(e.target.value)}
            placeholder="https://grafana.tundra.local/d-solo/abc123-uid?..."
            required
            className={inputCls}
          />
          <span className="text-[10px] text-white/30">
            Tip: copia el URL de "Share → Embed" en Grafana. Mantén las
            query params de variables.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/40">
              Orden
            </span>
            <input
              type="number"
              min={0}
              max={999}
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/40">
              Activo
            </span>
            <label className="flex items-center gap-2 mt-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Visible en el panel
            </label>
          </label>
        </div>

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
            {busy ? 'Guardando…' : isEdit ? 'Actualizar' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 bg-black/40 border border-tundra-border rounded-md text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-tundra-gold disabled:cursor-not-allowed';
