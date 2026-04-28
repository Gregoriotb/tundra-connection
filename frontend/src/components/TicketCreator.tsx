/**
 * TicketCreator — modal de creación de un ticket de soporte.
 *
 * Spec:
 *   - Orquestor.md §FASE 6
 *   - R2 No `any`. Tipos importados.
 *   - R3 Auth requerida (el endpoint exige JWT).
 */

import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { AlertCircle, Check, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import {
  ApiError,
  ticketsApi,
  type SupportTicket,
  type TicketPrioridad,
  type TicketServicio,
  type TicketTipo,
} from '../services/api';

// ─── Props ────────────────────────────────────────────────────────────────

interface TicketCreatorProps {
  open: boolean;
  onClose: () => void;
  onCreated: (ticket: SupportTicket) => void;
}

// ─── Variants Framer Motion ───────────────────────────────────────────────

const SPEC_EASE = [0.16, 1, 0.3, 1] as const;

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: SPEC_EASE },
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

// ─── Form data ────────────────────────────────────────────────────────────

interface FormState {
  tipo: TicketTipo;
  servicio_relacionado: TicketServicio;
  titulo: string;
  descripcion: string;
  prioridad: TicketPrioridad;
}

const INITIAL_FORM: FormState = {
  tipo: 'incidencia',
  servicio_relacionado: 'fibra_optica',
  titulo: '',
  descripcion: '',
  prioridad: 'media',
};

const TIPO_OPTIONS: { value: TicketTipo; label: string; hint: string }[] = [
  { value: 'incidencia', label: 'Incidencia', hint: 'Algo dejó de funcionar' },
  { value: 'requerimiento', label: 'Requerimiento', hint: 'Solicitud o cambio' },
];

const SERVICIO_OPTIONS: { value: TicketServicio; label: string }[] = [
  { value: 'fibra_optica', label: 'Internet por Fibra Óptica' },
  { value: 'satelital', label: 'Internet Satelital' },
  { value: 'servicios_extras', label: 'Servicios Técnicos' },
  { value: 'otro', label: 'Otro' },
];

const PRIORIDAD_OPTIONS: {
  value: TicketPrioridad;
  label: string;
  color: string;
}[] = [
  { value: 'baja', label: 'Baja', color: 'text-white/60' },
  { value: 'media', label: 'Media', color: 'text-tundra-gold' },
  { value: 'alta', label: 'Alta', color: 'text-tundra-warning' },
  { value: 'critica', label: 'Crítica', color: 'text-tundra-danger' },
];

// ─── Submit state ─────────────────────────────────────────────────────────

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; fieldErrors: Record<string, string> | null }
  | { kind: 'success'; ticket: SupportTicket };

// ─── Component ────────────────────────────────────────────────────────────

export function TicketCreator({
  open,
  onClose,
  onCreated,
}: TicketCreatorProps): JSX.Element {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setSubmit({ kind: 'idle' });
    }
  }, [open]);

  // Esc para cerrar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && submit.kind !== 'loading') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, submit.kind]);

  const tituloOk = form.titulo.trim().length >= 5;
  const descripcionOk = form.descripcion.trim().length >= 20;
  const canSubmit = tituloOk && descripcionOk && submit.kind !== 'loading';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmit({ kind: 'loading' });
    try {
      const ticket = await ticketsApi.create({
        tipo: form.tipo,
        servicio_relacionado: form.servicio_relacionado,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        prioridad: form.prioridad,
      });
      setSubmit({ kind: 'success', ticket });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudo crear el ticket';
      const fieldErrors = err instanceof ApiError ? err.fieldErrors : null;
      setSubmit({ kind: 'error', message, fieldErrors });
    }
  }

  const fieldErr = (key: string): string | null => {
    if (submit.kind !== 'error' || !submit.fieldErrors) return null;
    return submit.fieldErrors[key] ?? null;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={() => submit.kind !== 'loading' && onClose()}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Crear nuevo ticket de soporte"
        >
          <motion.div
            key="panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={[
              'relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl p-8',
              'bg-tundra-bg border border-tundra-border',
              'shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]',
            ].join(' ')}
          >
            <button
              type="button"
              disabled={submit.kind === 'loading'}
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute top-4 right-4 p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <X size={20} aria-hidden />
            </button>

            {submit.kind === 'success' ? (
              <SuccessPanel
                ticket={submit.ticket}
                onContinue={() => {
                  onCreated(submit.ticket);
                  onClose();
                }}
              />
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <header>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-tundra-gold mb-2">
                    Soporte técnico
                  </p>
                  <h2 className="font-display text-2xl text-white">
                    Reportar una falla
                  </h2>
                  <p className="text-sm text-white/40 mt-2">
                    Cuéntanos qué pasa. Nuestro equipo se conectará contigo a la
                    brevedad.
                  </p>
                </header>

                {/* Tipo */}
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
                    Tipo
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {TIPO_OPTIONS.map((opt) => {
                      const active = form.tipo === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm({ ...form, tipo: opt.value })}
                          className={[
                            'rounded-xl p-3 text-left border transition-all',
                            active
                              ? 'bg-tundra-gold/10 border-tundra-gold'
                              : 'bg-tundra-surface border-white/5 hover:border-tundra-gold/30',
                          ].join(' ')}
                        >
                          <p
                            className={[
                              'text-sm font-medium',
                              active ? 'text-tundra-gold' : 'text-white',
                            ].join(' ')}
                          >
                            {opt.label}
                          </p>
                          <p className="text-[10px] text-white/40 mt-0.5">
                            {opt.hint}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Servicio */}
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/50">
                    Servicio relacionado
                  </span>
                  <select
                    value={form.servicio_relacionado}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        servicio_relacionado: e.target.value as TicketServicio,
                      })
                    }
                    className="rounded-lg px-3 py-2.5 bg-tundra-surface border border-white/10 text-sm text-white focus:outline-none focus:border-tundra-gold focus:ring-1 focus:ring-tundra-gold/30"
                  >
                    {SERVICIO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Prioridad */}
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
                    Prioridad sugerida
                  </legend>
                  <div className="grid grid-cols-4 gap-2">
                    {PRIORIDAD_OPTIONS.map((opt) => {
                      const active = form.prioridad === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm({ ...form, prioridad: opt.value })}
                          className={[
                            'rounded-lg py-2 text-xs uppercase tracking-wider font-semibold border transition-all',
                            active
                              ? 'bg-white/5 border-tundra-gold'
                              : 'bg-transparent border-white/10 hover:border-white/30',
                            opt.color,
                          ].join(' ')}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-white/30">
                    Nuestro equipo puede ajustar la prioridad después de revisar.
                  </p>
                </fieldset>

                {/* Título */}
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/50">
                    Título <span className="text-tundra-danger">*</span>
                  </span>
                  <input
                    type="text"
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Ej: Sin internet desde esta mañana"
                    minLength={5}
                    maxLength={255}
                    className={[
                      'rounded-lg px-3 py-2.5 bg-tundra-surface border text-sm text-white',
                      'placeholder:text-white/20 transition-colors',
                      'focus:outline-none focus:ring-1',
                      fieldErr('titulo')
                        ? 'border-tundra-danger focus:border-tundra-danger focus:ring-tundra-danger/30'
                        : 'border-white/10 focus:border-tundra-gold focus:ring-tundra-gold/30',
                    ].join(' ')}
                    aria-invalid={Boolean(fieldErr('titulo'))}
                  />
                  <span className="text-[10px] text-white/30">
                    Mínimo 5 caracteres. {form.titulo.trim().length}/255
                  </span>
                </label>

                {/* Descripción */}
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/50">
                    Descripción <span className="text-tundra-danger">*</span>
                  </span>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) =>
                      setForm({ ...form, descripcion: e.target.value })
                    }
                    placeholder="Describe lo que está pasando: cuándo empezó, qué intentaste, mensajes de error..."
                    rows={5}
                    minLength={20}
                    maxLength={5000}
                    className={[
                      'rounded-lg px-3 py-2.5 bg-tundra-surface border text-sm text-white',
                      'placeholder:text-white/20 transition-colors resize-none',
                      'focus:outline-none focus:ring-1',
                      fieldErr('descripcion')
                        ? 'border-tundra-danger focus:border-tundra-danger focus:ring-tundra-danger/30'
                        : 'border-white/10 focus:border-tundra-gold focus:ring-tundra-gold/30',
                    ].join(' ')}
                    aria-invalid={Boolean(fieldErr('descripcion'))}
                  />
                  <span className="text-[10px] text-white/30">
                    Mínimo 20 caracteres. {form.descripcion.trim().length}/5000
                  </span>
                </label>

                {submit.kind === 'error' && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 p-3 rounded-lg bg-tundra-danger/10 border border-tundra-danger/30 text-sm text-white/80"
                  >
                    <AlertCircle
                      size={16}
                      className="mt-0.5 text-tundra-danger flex-shrink-0"
                      aria-hidden
                    />
                    <span>{submit.message}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={[
                    'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg',
                    'text-sm uppercase tracking-wider font-semibold transition-all duration-200',
                    canSubmit
                      ? 'bg-tundra-gold text-black hover:bg-tundra-goldBright hover:shadow-[0_0_30px_-5px_rgba(250,204,21,0.6)]'
                      : 'bg-white/5 text-white/30 cursor-not-allowed',
                  ].join(' ')}
                >
                  {submit.kind === 'loading' ? 'Creando…' : 'Crear ticket'}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── SuccessPanel ─────────────────────────────────────────────────────────

interface SuccessPanelProps {
  ticket: SupportTicket;
  onContinue: () => void;
}

function SuccessPanel({ ticket, onContinue }: SuccessPanelProps): JSX.Element {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-6">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-tundra-success/15 border border-tundra-success text-tundra-success">
        <Check size={32} strokeWidth={3} aria-hidden />
      </div>
      <div>
        <h3 className="font-display text-2xl text-white mb-2">
          Ticket creado
        </h3>
        <p className="text-sm text-white/50">
          Hemos recibido tu reporte. Nuestro equipo lo revisará pronto.
        </p>
      </div>
      <p className="text-[11px] uppercase tracking-wider text-white/30">
        Número:{' '}
        <span className="font-mono text-tundra-gold">{ticket.ticket_number}</span>
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-tundra-gold text-black text-sm uppercase tracking-wider font-semibold hover:bg-tundra-goldBright transition-colors"
      >
        Ver mis tickets
      </button>
    </div>
  );
}
