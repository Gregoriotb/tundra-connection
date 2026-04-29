/**
 * AdminCatalogTab — CRUD del catálogo (FASE 8, archivo 7/12).
 *
 * Spec:
 * - Orquestor.md §FASE 8 — admin tab Catálogo
 * - Backend: POST/PUT/DELETE /admin/catalog (tope 10 items, soft delete)
 * - R2 No `any`. R9 Validación cliente + server.
 * - R13 Las acciones quedan logueadas en backend.
 *
 * Decisiones:
 * - Tabla con edición inline-by-row → click "Editar" abre modal con form.
 * - Borrado es SOFT (backend hace is_active=False); UI muestra "Inactivo"
 *   y refresca. Para purgar de verdad iría una acción "purge" (out-of-scope).
 * - Re-fetch tras cada mutación — la lista pública usa otro filtro y un
 *   refresh global del catálogo no aplica acá.
 */

import { useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import {
  catalogApi,
  type CatalogItemCreateBody,
  type CatalogItemUpdateBody,
} from '../../services/api';
import type { CatalogItem } from '../CatalogCard';
import type { CatalogTipo } from '../../types';

const TIPO_OPTIONS: { value: CatalogTipo; label: string }[] = [
  { value: 'router', label: 'Router' },
  { value: 'camara', label: 'Cámara' },
  { value: 'equipo_red', label: 'Equipo de red' },
  { value: 'accesorio', label: 'Accesorio' },
];

export function AdminCatalogTab(): JSX.Element {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      const res = await catalogApi.list();
      setItems(res.items);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error cargando catálogo');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleDelete = async (item: CatalogItem): Promise<void> => {
    if (!window.confirm(`¿Desactivar "${item.name}"? (soft delete)`)) return;
    setBusyId(item.id);
    try {
      await catalogApi.adminDelete(item.id);
      await refresh();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error al eliminar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-tundra-gold">Catálogo</h2>
          <p className="text-xs uppercase tracking-wider text-white/40">
            {items === null ? '…' : `${items.length} / 10 items`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider text-white/60 border border-tundra-border rounded-md hover:text-white hover:border-white/30"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refrescar
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            disabled={items !== null && items.length >= 10}
            className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo item
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Tabla ────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-tundra-border">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="text-left px-4 py-3 font-normal">Nombre</th>
              <th className="text-left px-4 py-3 font-normal">Tipo</th>
              <th className="text-right px-4 py-3 font-normal">Precio</th>
              <th className="text-right px-4 py-3 font-normal">Stock</th>
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
                  Catálogo vacío.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{it.name}</div>
                    {it.description && (
                      <div className="text-xs text-white/40 line-clamp-1">
                        {it.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/70 capitalize">
                    {it.tipo.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3 text-right text-tundra-gold">
                    ${it.price}
                  </td>
                  <td
                    className={[
                      'px-4 py-3 text-right',
                      it.stock === 0 ? 'text-red-300' : 'text-white/70',
                    ].join(' ')}
                  >
                    {it.stock}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={[
                        'inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider',
                        it.is_active
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-white/5 text-white/40',
                      ].join(' ')}
                    >
                      {it.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditing(it);
                          setShowForm(true);
                        }}
                        className="p-1.5 text-white/50 hover:text-tundra-gold"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(it)}
                        disabled={!it.is_active || busyId === it.id}
                        className="p-1.5 text-white/50 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Soft delete"
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

      {/* ── Form modal ───────────────────────────────────────────────── */}
      {showForm && (
        <CatalogItemForm
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
  initial: CatalogItem | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function CatalogItemForm({ initial, onClose, onSaved }: FormProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tipo, setTipo] = useState<CatalogTipo>(initial?.tipo ?? 'router');
  const [price, setPrice] = useState(initial?.price ?? '0.00');
  const [stock, setStock] = useState<number>(initial?.stock ?? 0);
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = initial !== null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    // Validación básica cliente — server-side R9 hace el resto.
    if (name.trim().length < 2) {
      setError('Nombre demasiado corto');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(price)) {
      setError('Precio inválido (formato: 150.00)');
      return;
    }
    if (stock < 0) {
      setError('Stock no puede ser negativo');
      return;
    }

    setSubmitting(true);
    try {
      const body: CatalogItemCreateBody = {
        name: name.trim(),
        description: description.trim() || null,
        tipo,
        price,
        stock,
        image_url: imageUrl.trim() || null,
        is_active: isActive,
      };
      if (isEdit && initial) {
        const update: CatalogItemUpdateBody = body;
        await catalogApi.adminUpdate(initial.id, update);
      } else {
        await catalogApi.adminCreate(body);
      }
      await onSaved();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error guardando item');
    } finally {
      setSubmitting(false);
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
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-tundra-gold">
            {isEdit ? 'Editar item' : 'Nuevo item'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white text-xs uppercase tracking-wider"
          >
            Cerrar
          </button>
        </div>

        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            className={inputCls}
          />
        </Field>

        <Field label="Descripción (opcional)">
          <textarea
            value={description ?? ''}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={500}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as CatalogTipo)}
              className={inputCls}
            >
              {TIPO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-tundra-bg">
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Precio (USD)">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="150.00"
              required
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock">
            <input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(Number(e.target.value))}
              required
              className={inputCls}
            />
          </Field>

          <Field label="Activo">
            <label className="flex items-center gap-2 mt-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Visible en el catálogo público
            </label>
          </Field>
        </div>

        <Field label="URL de imagen (opcional)">
          <input
            value={imageUrl ?? ''}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className={inputCls}
          />
        </Field>

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
            disabled={submitting}
            className="px-4 py-2 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : isEdit ? 'Actualizar' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 bg-black/40 border border-tundra-border rounded-md text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-tundra-gold';

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
