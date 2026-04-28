/**
 * AdminQuotationsTab — vista admin de threads de cotización (FASE 8, 9/12).
 *
 * Spec:
 * - Orquestor.md §FASE 8 — admin tab Cotizaciones
 * - Backend: GET /admin/threads, PATCH /admin/threads/{id}/status
 * - El detalle del thread y los mensajes ya existen vía /chat-quotations/threads/{id}
 *   (acceso permitido a admin por IDOR check). En esta vista solo listamos
 *   y permitimos cambios de estado. La conversación completa la lleva
 *   ChatThread reutilizado en otra pantalla.
 */

import { useEffect, useState } from 'react';
import { Pencil, RefreshCw } from 'lucide-react';

import {
  chatApi,
  type QuotationThread,
  type ThreadUpdateStatusBody,
} from '../../services/api';

type ThreadEstado = QuotationThread['estado'];

const ESTADO_LABEL: Record<ThreadEstado, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  quoted: 'Cotizado',
  negotiating: 'Negociando',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

const ESTADO_TONE: Record<ThreadEstado, string> = {
  pending: 'bg-yellow-500/10 text-yellow-300',
  active: 'bg-blue-500/10 text-blue-300',
  quoted: 'bg-cyan-500/10 text-cyan-300',
  negotiating: 'bg-violet-500/10 text-violet-300',
  closed: 'bg-emerald-500/10 text-emerald-300',
  cancelled: 'bg-white/5 text-white/40',
};

export function AdminQuotationsTab(): JSX.Element {
  const [items, setItems] = useState<QuotationThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterEstado, setFilterEstado] = useState<ThreadEstado | ''>('');
  const [editing, setEditing] = useState<QuotationThread | null>(null);

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      const res = await chatApi.adminListThreads(filterEstado || undefined);
      setItems(res.items);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Error cargando hilos');
    }
  };

  useEffect(() => {
    void refresh();
  }, [filterEstado]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-tundra-gold">
            Cotizaciones
          </h2>
          <p className="text-xs uppercase tracking-wider text-white/40">
            {items === null ? '…' : `${items.length} hilos`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value as ThreadEstado | '')}
            className="px-2.5 py-1.5 bg-black/40 border border-tundra-border rounded-md text-xs text-white focus:outline-none focus:border-tundra-gold"
          >
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADO_LABEL) as ThreadEstado[]).map((est) => (
              <option key={est} value={est} className="bg-tundra-bg">
                {ESTADO_LABEL[est]}
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
              <th className="text-left px-4 py-3 font-normal">Cliente</th>
              <th className="text-left px-4 py-3 font-normal">Requerimiento</th>
              <th className="text-right px-4 py-3 font-normal">Presupuesto</th>
              <th className="text-center px-4 py-3 font-normal">Estado</th>
              <th className="text-center px-4 py-3 font-normal">Sin leer</th>
              <th className="text-left px-4 py-3 font-normal">Última act.</th>
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
                  Sin hilos.
                </td>
              </tr>
            ) : (
              items.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="text-white">
                      {[t.user.first_name, t.user.last_name]
                        .filter(Boolean)
                        .join(' ') || '(sin nombre)'}
                    </div>
                    <div className="font-mono text-[10px] text-white/40">
                      {t.user.id.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70 max-w-md">
                    <div className="line-clamp-1">
                      {t.requerimiento_inicial ?? '—'}
                    </div>
                    {t.last_message_preview && (
                      <div className="text-xs text-white/30 line-clamp-1">
                        {t.last_message_preview}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-tundra-gold">
                    {t.presupuesto_estimado
                      ? `$${t.presupuesto_estimado}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={[
                        'inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider',
                        ESTADO_TONE[t.estado],
                      ].join(' ')}
                    >
                      {ESTADO_LABEL[t.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {t.unread_count > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-tundra-gold text-black text-[10px] font-semibold">
                        {t.unread_count}
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs">
                    {new Date(t.updated_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => setEditing(t)}
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
        <ThreadStatusModal
          thread={editing}
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

// ─── Modal ───────────────────────────────────────────────────────────────

interface ModalProps {
  thread: QuotationThread;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function ThreadStatusModal({ thread, onClose, onSaved }: ModalProps): JSX.Element {
  const [estado, setEstado] = useState<ThreadEstado>(thread.estado);
  const [presupuesto, setPresupuesto] = useState(
    thread.presupuesto_estimado ?? '',
  );
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (presupuesto && !/^\d+(\.\d{1,2})?$/.test(presupuesto)) {
      setError('Presupuesto inválido (formato: 1500.00)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: ThreadUpdateStatusBody = {
        estado,
        presupuesto_estimado: presupuesto.trim() || null,
        nota: nota.trim() || null,
      };
      await chatApi.adminUpdateStatus(thread.id, body);
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
            Actualizar cotización
          </h3>
          <p className="text-xs uppercase tracking-wider text-white/40 mt-1">
            Hilo <span className="font-mono">{thread.id.slice(0, 8)}…</span>
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Estado
          </span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as ThreadEstado)}
            className="px-3 py-2 bg-black/40 border border-tundra-border rounded-md text-sm text-white focus:outline-none focus:border-tundra-gold"
          >
            {(Object.keys(ESTADO_LABEL) as ThreadEstado[]).map((est) => (
              <option key={est} value={est} className="bg-tundra-bg">
                {ESTADO_LABEL[est]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Presupuesto estimado (USD, opcional)
          </span>
          <input
            value={presupuesto}
            onChange={(e) => setPresupuesto(e.target.value)}
            placeholder="1500.00"
            className="px-3 py-2 bg-black/40 border border-tundra-border rounded-md text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-tundra-gold"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Nota (se inserta como mensaje system, opcional)
          </span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Mensaje al cliente sobre el cambio…"
            className="px-3 py-2 bg-black/40 border border-tundra-border rounded-md text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-tundra-gold"
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
            {busy ? 'Guardando…' : 'Aplicar'}
          </button>
        </div>
      </form>
    </div>
  );
}
