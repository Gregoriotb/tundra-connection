/**
 * MyInvoicesTab — todas las facturas del cliente.
 *
 * Spec:
 * - Vista del cliente: ve sus propias facturas (no las de otros usuarios).
 * - Reusa `invoicesApi.myInvoices()` que ya filtra por user_id en backend
 *   (R4 IDOR-safe).
 * - Filtros client-side: tipo (PRODUCT_SALE / INTERNET_SERVICE / etc.) y
 *   estado (pending / paid / cancelled / overdue / refunded).
 * - El cliente NO puede cambiar el estado — solo ver. Cambios los hace el
 *   admin desde su panel.
 *
 * UX:
 * - Tabla con expansion al hacer click (ver items / plan / detalles).
 * - Total de pagado al header como KPI rápido.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Receipt,
  RefreshCw,
} from 'lucide-react';

import { invoicesApi, type Invoice } from '../../services/api';

const ESTADO_LABEL: Record<Invoice['estado'], string> = {
  pending: 'Pendiente',
  paid: 'Pagada',
  cancelled: 'Cancelada',
  overdue: 'Vencida',
  refunded: 'Reembolsada',
};

const ESTADO_TONE: Record<Invoice['estado'], string> = {
  pending: 'bg-yellow-500/10 text-yellow-300',
  paid: 'bg-emerald-500/10 text-emerald-300',
  cancelled: 'bg-white/5 text-white/40',
  overdue: 'bg-red-500/10 text-red-300',
  refunded: 'bg-blue-500/10 text-blue-300',
};

const TIPO_LABEL: Record<Invoice['tipo'], string> = {
  PRODUCT_SALE: 'Compra de equipo',
  INTERNET_SERVICE: 'Servicio internet',
  SERVICE_QUOTATION: 'Servicio cotizado',
};

export function MyInvoicesTab(): JSX.Element {
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterEstado, setFilterEstado] = useState<Invoice['estado'] | ''>('');
  const [filterTipo, setFilterTipo] = useState<Invoice['tipo'] | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoicesApi.myInvoices();
      setItems(res.items);
    } catch (err) {
      const e = err as { detail?: string; message?: string };
      setError(e.detail ?? e.message ?? 'Error cargando facturas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Filtros client-side (la lista del cliente es típicamente pequeña).
  const filtered = useMemo(() => {
    if (!items) return null;
    return items.filter((inv) => {
      if (filterEstado && inv.estado !== filterEstado) return false;
      if (filterTipo && inv.tipo !== filterTipo) return false;
      return true;
    });
  }, [items, filterEstado, filterTipo]);

  const totals = useMemo(() => {
    if (!items) return null;
    const paid = items
      .filter((i) => i.estado === 'paid')
      .reduce((acc, i) => acc + Number(i.total), 0);
    const pending = items
      .filter((i) => i.estado === 'pending')
      .reduce((acc, i) => acc + Number(i.total), 0);
    return { paid, pending };
  }, [items]);

  return (
    <section className="flex flex-col gap-4">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-tundra-gold flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Mis facturas
          </h2>
          <p className="text-xs uppercase tracking-wider text-white/40">
            {filtered === null
              ? '…'
              : `${filtered.length} ${filtered.length === 1 ? 'resultado' : 'resultados'}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-white/30" />
          <select
            value={filterEstado}
            onChange={(e) =>
              setFilterEstado(e.target.value as Invoice['estado'] | '')
            }
            className={selectCls}
          >
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADO_LABEL) as Invoice['estado'][]).map((est) => (
              <option key={est} value={est} className="bg-tundra-bg">
                {ESTADO_LABEL[est]}
              </option>
            ))}
          </select>
          <select
            value={filterTipo}
            onChange={(e) =>
              setFilterTipo(e.target.value as Invoice['tipo'] | '')
            }
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
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wider text-white/60 border border-tundra-border rounded-md hover:text-white hover:border-white/30 disabled:opacity-50"
          >
            <RefreshCw
              className={['w-3.5 h-3.5', loading ? 'animate-spin' : ''].join(' ')}
            />
          </button>
        </div>
      </div>

      {/* ── Totals KPIs ──────────────────────────────────────────────── */}
      {totals && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-emerald-500/30 bg-white/[0.02] px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Total pagado
            </div>
            <div className="font-display text-2xl text-emerald-300 mt-1">
              ${totals.paid.toFixed(2)}
            </div>
          </div>
          <div
            className={[
              'rounded-md border bg-white/[0.02] px-4 py-3',
              totals.pending > 0
                ? 'border-yellow-500/30'
                : 'border-tundra-border',
            ].join(' ')}
          >
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Por pagar
            </div>
            <div
              className={[
                'font-display text-2xl mt-1',
                totals.pending > 0 ? 'text-yellow-300' : 'text-white/60',
              ].join(' ')}
            >
              ${totals.pending.toFixed(2)}
            </div>
          </div>
        </div>
      )}

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
              <th className="w-8 px-2 py-3"></th>
              <th className="text-left px-4 py-3 font-normal">Fecha</th>
              <th className="text-left px-4 py-3 font-normal">Tipo</th>
              <th className="text-right px-4 py-3 font-normal">Total</th>
              <th className="text-center px-4 py-3 font-normal">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tundra-border">
            {filtered === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/30">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/30">
                  {items && items.length > 0
                    ? 'Sin resultados con esos filtros.'
                    : 'No tienes facturas todavía.'}
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const isOpen = expandedId === inv.id;
                return (
                  <Fragment key={inv.id}>
                    <tr
                      onClick={() => setExpandedId(isOpen ? null : inv.id)}
                      className="hover:bg-white/[0.02] cursor-pointer"
                    >
                      <td className="px-2 py-3 text-white/40">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/70 text-xs">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {TIPO_LABEL[inv.tipo]}
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
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="bg-white/[0.01] px-6 py-4">
                          <InvoiceDetail invoice={inv} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Detail expansion ──────────────────────────────────────────────────

function InvoiceDetail({ invoice }: { invoice: Invoice }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <DetailRow label="ID" value={invoice.id} mono />
      {invoice.paid_at && (
        <DetailRow
          label="Pagada el"
          value={new Date(invoice.paid_at).toLocaleString()}
        />
      )}
      <DetailRow label="Subtotal" value={`$${invoice.subtotal}`} />
      <DetailRow label="Impuesto" value={`$${invoice.tax_amount}`} />
      <DetailRow label="Total" value={`$${invoice.total}`} bold />

      {/* PRODUCT_SALE: items list */}
      {invoice.tipo === 'PRODUCT_SALE' && invoice.items.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
            Productos
          </div>
          <ul className="flex flex-col gap-1.5 text-xs">
            {invoice.items.map((item, i) => {
              const it = item as Record<string, unknown>;
              return (
                <li
                  key={i}
                  className="flex items-center justify-between text-white/60"
                >
                  <span>
                    {(it.name as string) ?? 'Producto'} ×{' '}
                    {(it.quantity as number) ?? 1}
                  </span>
                  <span className="text-tundra-gold">
                    ${(it.subtotal as string) ?? '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* INTERNET_SERVICE: plan info */}
      {invoice.tipo === 'INTERNET_SERVICE' && invoice.plan_seleccionado && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
            Plan contratado
          </div>
          <div className="rounded border border-tundra-border bg-black/40 p-3 text-xs text-white/70">
            {Object.entries(invoice.plan_seleccionado).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <span className="text-white/40 capitalize">{k}</span>
                <span>{String(v)}</span>
              </div>
            ))}
          </div>
          {invoice.direccion_instalacion && (
            <div className="mt-2 text-xs text-white/50">
              <span className="text-white/40 uppercase tracking-wider">
                Dirección:{' '}
              </span>
              {invoice.direccion_instalacion}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}

function DetailRow({ label, value, mono, bold }: DetailRowProps): JSX.Element {
  return (
    <div className="flex justify-between items-center gap-4 text-xs">
      <span className="text-white/40 uppercase tracking-wider">{label}</span>
      <span
        className={[
          mono ? 'font-mono text-[10px]' : '',
          bold ? 'text-tundra-gold font-semibold' : 'text-white/80',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

const selectCls =
  'px-2.5 py-1.5 bg-black/40 border border-tundra-border rounded-md text-xs text-white focus:outline-none focus:border-tundra-gold';
