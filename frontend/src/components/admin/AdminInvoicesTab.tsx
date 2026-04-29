/**
 * AdminInvoicesTab — listado global + cambio de estado (FASE 8, archivo 8/12).
 *
 * Spec:
 * - Orquestor.md §FASE 8 — admin tab Facturas
 * - Backend: GET /admin/invoices, PATCH /admin/invoices/{id}/status
 * - R2 No `any`. R9 Validación de transición server-side.
 * - R13 Cada cambio queda logueado y notifica al cliente.
 *
 * Decisiones:
 * - Tabla simple con filtros por estado y tipo (server-side, no client-side).
 * - Cambio de estado vía modal con nota opcional — la nota se persiste en
 *   `extra_data.status_history` para auditoría.
 */

import { useEffect, useMemo, useState } from 'react';
import { Filter, Pencil, RefreshCw } from 'lucide-react';

import {
  invoicesApi,
  type Invoice,
  type InvoiceEstado,
  type InvoiceUpdateStatusBody,
} from '../../services/api';

const ESTADO_LABEL: Record<InvoiceEstado, string> = {
  pending: 'Pendiente',
  paid: 'Pagada',
  cancelled: 'Cancelada',
  overdue: 'Vencida',
  refunded: 'Reembolsada',
};

const ESTADO_TONE: Record<InvoiceEstado, string> = {
  pending: 'bg-yellow-500/10 text-yellow-300',
  paid: 'bg-emerald-500/10 text-emerald-300',
  cancelled: 'bg-white/5 text-white/40',
  overdue: 'bg-red-500/10 text-red-300',
  refunded: 'bg-blue-500/10 text-blue-300',
};

const TIPO_LABEL: Record<Invoice['tipo'], string> = {
  PRODUCT_SALE: 'Venta producto',
  INTERNET_SERVICE: 'Servicio internet',
  SERVICE_QUOTATION: 'Cotización servicio',
};

export function AdminInvoicesTab(): JSX.Element {
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterEstado, setFilterEstado] = useState<InvoiceEstado | ''>('');
  const [filterTipo, setFilterTipo] = useState<Invoice['tipo'] | ''>('');
  const [editing, setEditing] = useState<Invoice | null>(null);

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      const res = await invoicesApi.adminList({
        estado: filterEstado || undefined,
        tipo: filterTipo || undefined,
      });
      setItems(res.items);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error cargando facturas');
    }
  };

  useEffect(() => {
    void refresh();
  }, [filterEstado, filterTipo]);

  const totalPaid = useMemo(() => {
    if (!items) return null;
    return items
      .filter((i) => i.estado === 'paid')
      .reduce((acc, i) => acc + Number(i.total), 0);
  }, [items]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-tundra-gold">Facturas</h2>
          <p className="text-xs uppercase tracking-wider text-white/40">
            {items === null
              ? '…'
              : `${items.length} resultados${totalPaid !== null ? ` · pagadas $${totalPaid.toFixed(2)}` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-white/30" />
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value as InvoiceEstado | '')}
            className={selectCls}
          >
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADO_LABEL) as InvoiceEstado[]).map((est) => (
              <option key={est} value={est} className="bg-tundra-bg">
                {ESTADO_LABEL[est]}
              </option>
            ))}
          </select>
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value as Invoice['tipo'] | '')}
            className={selectCls}
          >
            <option value="">Todos los tipos</option>
            {(Object.keys(TIPO_LABEL) as Invoice['tipo'][]).map((t) => (
              <option key={t} value={t} className="bg-tundra-bg">
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wider text-white/60 border border-tundra-border rounded-md hover:text-white hover:border-white/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
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
              <th className="text-left px-4 py-3 font-normal">ID</th>
              <th className="text-left px-4 py-3 font-normal">Tipo</th>
              <th className="text-left px-4 py-3 font-normal">Cliente</th>
              <th className="text-right px-4 py-3 font-normal">Total</th>
              <th className="text-center px-4 py-3 font-normal">Estado</th>
              <th className="text-left px-4 py-3 font-normal">Fecha</th>
              <th className="text-right px-4 py-3 font-normal">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tundra-border">
            {items === null ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/30">
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-white/30">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              items.map((inv) => (
                <tr key={inv.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-[11px] text-white/50">
                    {inv.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {TIPO_LABEL[inv.tipo]}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/50">
                    {inv.user_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-right text-tundra-gold">
                    ${inv.total}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={[
                        'inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider',
                        ESTADO_TONE[inv.estado],
                      ].join(' ')}
                    >
                      {ESTADO_LABEL[inv.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => setEditing(inv)}
                        className="p-1.5 text-white/50 hover:text-tundra-gold"
                        title="Cambiar estado"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <StatusModal
          invoice={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

// ─── Modal de cambio de estado ──────────────────────────────────────────

interface StatusModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function StatusModal({ invoice, onClose, onSaved }: StatusModalProps): JSX.Element {
  const [estado, setEstado] = useState<InvoiceEstado>(invoice.estado);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: InvoiceUpdateStatusBody = {
        estado,
        nota: nota.trim() || null,
      };
      await invoicesApi.adminUpdateStatus(invoice.id, body);
      await onSaved();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error al actualizar');
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
        <div>
          <h3 className="font-display text-lg text-tundra-gold">
            Cambiar estado
          </h3>
          <p className="text-xs uppercase tracking-wider text-white/40 mt-1">
            Factura{' '}
            <span className="font-mono">{invoice.id.slice(0, 8)}…</span> ·{' '}
            ${invoice.total}
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Nuevo estado
          </span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as InvoiceEstado)}
            className={selectCls}
          >
            {(Object.keys(ESTADO_LABEL) as InvoiceEstado[]).map((est) => (
              <option key={est} value={est} className="bg-tundra-bg">
                {ESTADO_LABEL[est]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Nota (opcional, queda en historial)
          </span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Razón del cambio…"
            className="w-full px-3 py-2 bg-black/40 border border-tundra-border rounded-md text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-tundra-gold"
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
            disabled={busy || estado === invoice.estado}
            className="px-4 py-2 text-xs uppercase tracking-wider bg-tundra-gold text-black rounded-md hover:bg-yellow-300 disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Aplicar'}
          </button>
        </div>
      </form>
    </div>
  );
}

const selectCls =
  'px-2.5 py-1.5 bg-black/40 border border-tundra-border rounded-md text-xs text-white focus:outline-none focus:border-tundra-gold';
