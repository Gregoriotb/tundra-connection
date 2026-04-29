/**
 * InternetPlanModal — modal final del flow de internet.
 *
 * Spec:
 *   - Orquestor.md §FASE 3
 *   - R2 No `any`. Props tipadas.
 *   - R3 Auth requerida (el endpoint /invoices/checkout exige JWT)
 *   - R9 Sólo recolecta dirección y dispara checkout — el backend recalcula
 *        precio y total contra BD.
 *
 * Flow:
 *   1. Usuario abre ServiceOverlay y selecciona un plan.
 *   2. Sección monta este modal con `service` + `plan`.
 *   3. Usuario captura dirección de instalación.
 *   4. Si NO está autenticado, mostramos CTA para registrarse antes.
 *   5. Submit → POST /invoices/checkout. Éxito → muestra confirmación.
 */

import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { AlertCircle, Check, MapPin, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { ApiError, invoicesApi } from '../services/api';
import type { InternetPlan, Service } from './ServiceCard';

// ─── Props ────────────────────────────────────────────────────────────────

interface InternetPlanModalProps {
  service: Service | null;
  plan: InternetPlan | null;
  onClose: () => void;
  onLoginRequest: () => void;
  onSuccess: (invoiceId: string) => void;
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

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatPrice(price: string): string {
  const [intPart, decPart = '00'] = price.split('.');
  return `$${intPart}.${decPart.padEnd(2, '0').slice(0, 2)}`;
}

function sumPrices(...values: string[]): string {
  // Suma en centavos, retorna string-decimal.
  let cents = 0;
  for (const v of values) {
    const [intPart, decPart = '00'] = v.split('.');
    cents += Number.parseInt(intPart, 10) * 100 + Number.parseInt((decPart + '00').slice(0, 2), 10);
  }
  const intPart = Math.floor(cents / 100);
  const decPart = (cents % 100).toString().padStart(2, '0');
  return `${intPart}.${decPart}`;
}

// ─── Estado de submit ─────────────────────────────────────────────────────

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; fieldErrors: Record<string, string> | null }
  | { kind: 'success'; invoiceId: string };

const MIN_ADDRESS = 10;

// ─── Componente ───────────────────────────────────────────────────────────

export function InternetPlanModal({
  service,
  plan,
  onClose,
  onLoginRequest,
  onSuccess,
}: InternetPlanModalProps): JSX.Element {
  const { status: authStatus } = useAuth();
  const [direccion, setDireccion] = useState('');
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  const isOpen = service !== null && plan !== null;

  // Reset al abrir.
  useEffect(() => {
    if (isOpen) {
      setDireccion('');
      setSubmit({ kind: 'idle' });
    }
  }, [isOpen]);

  // Esc para cerrar.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && submit.kind !== 'loading') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, submit.kind]);

  if (!isOpen || !service || !plan) {
    return <AnimatePresence />;
  }

  const total = sumPrices(plan.precio_mensual, service.precio_instalacion_base);
  const isAuth = authStatus === 'authenticated';
  const canSubmit =
    isAuth && direccion.trim().length >= MIN_ADDRESS && submit.kind !== 'loading';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !service || !plan) return;
    setSubmit({ kind: 'loading' });
    try {
      const invoice = await invoicesApi.checkout({
        tipo: 'INTERNET_SERVICE',
        service_id: service.id,
        plan_id: plan.id,
        direccion_instalacion: direccion.trim(),
      });
      setSubmit({ kind: 'success', invoiceId: invoice.id });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudo procesar la solicitud';
      const fieldErrors = err instanceof ApiError ? err.fieldErrors : null;
      setSubmit({ kind: 'error', message, fieldErrors });
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={() => submit.kind !== 'loading' && onClose()}
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Confirmación de plan ${plan.nombre}`}
      >
        <motion.div
          key="panel"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          className={[
            'relative w-full max-w-lg rounded-3xl p-8',
            'bg-[#050505] border border-[rgba(197,160,89,0.3)]',
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
              invoiceId={submit.invoiceId}
              onContinue={() => {
                onSuccess(submit.invoiceId);
                onClose();
              }}
            />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Header */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#C5A059] mb-2">
                  Confirmación
                </p>
                <h2 className="font-[Archivo_Black] text-2xl text-white mb-1">
                  {plan.nombre}
                </h2>
                <p className="text-sm text-white/40">{service.name}</p>
              </div>

              {/* Resumen de precios */}
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-[#0a0a0a] border border-white/5">
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-white/50">Mensualidad</span>
                  <span className="text-white">{formatPrice(plan.precio_mensual)}</span>
                </div>
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-white/50">Instalación base</span>
                  <span className="text-white">
                    {formatPrice(service.precio_instalacion_base)}
                  </span>
                </div>
                <div className="border-t border-white/5 pt-3 flex justify-between items-baseline">
                  <span className="text-xs uppercase tracking-wider text-white/40">
                    Total inicial
                  </span>
                  <span className="font-[Archivo_Black] text-2xl text-[#FACC15]">
                    {formatPrice(total)}
                  </span>
                </div>
              </div>

              {/* Auth gate o form */}
              {!isAuth ? (
                <div className="flex flex-col gap-4 p-5 rounded-xl bg-[rgba(197,160,89,0.05)] border border-[rgba(197,160,89,0.2)]">
                  <p className="text-sm text-white/70">
                    Para contratar el servicio necesitas iniciar sesión o crear una
                    cuenta.
                  </p>
                  <button
                    type="button"
                    onClick={onLoginRequest}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#C5A059] text-black text-sm uppercase tracking-wider font-semibold hover:bg-[#FACC15] transition-colors"
                  >
                    Continuar al inicio de sesión
                  </button>
                </div>
              ) : (
                <>
                  {/* Dirección */}
                  <label className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                      <MapPin size={14} aria-hidden />
                      Dirección de instalación
                    </span>
                    <textarea
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      rows={3}
                      placeholder="Calle, número, edificio, sector, ciudad, estado..."
                      maxLength={500}
                      className={[
                        'w-full rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/20',
                        'bg-[#0a0a0a] border border-white/10',
                        'focus:outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/30',
                        'transition-colors resize-none',
                      ].join(' ')}
                      aria-invalid={
                        Boolean(submit.kind === 'error' && submit.fieldErrors?.direccion_instalacion)
                      }
                    />
                    <span className="text-[10px] text-white/30">
                      Mínimo {MIN_ADDRESS} caracteres. Sé lo más específico posible.
                    </span>
                  </label>

                  {submit.kind === 'error' && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-[#DC3545]/10 border border-[#DC3545]/30 text-sm text-white/80">
                      <AlertCircle size={16} className="mt-0.5 text-[#DC3545]" aria-hidden />
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
                        ? 'bg-[#C5A059] text-black hover:bg-[#FACC15] hover:shadow-[0_0_30px_-5px_rgba(250,204,21,0.6)]'
                        : 'bg-white/5 text-white/30 cursor-not-allowed',
                    ].join(' ')}
                  >
                    {submit.kind === 'loading' ? 'Procesando…' : 'Generar factura'}
                  </button>
                </>
              )}
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Subcomponente: éxito ──────────────────────────────────────────────────

interface SuccessPanelProps {
  invoiceId: string;
  onContinue: () => void;
}

function SuccessPanel({ invoiceId, onContinue }: SuccessPanelProps): JSX.Element {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-6">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-[rgba(25,135,84,0.15)] border border-[#198754] text-[#198754]">
        <Check size={32} strokeWidth={3} aria-hidden />
      </div>
      <div>
        <h3 className="font-[Archivo_Black] text-2xl text-white mb-2">
          Factura generada
        </h3>
        <p className="text-sm text-white/50">
          Hemos creado tu solicitud. Recibirás los detalles del proceso de
          instalación a la brevedad.
        </p>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-white/30">
        ID: <span className="font-mono">{invoiceId}</span>
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#C5A059] text-black text-sm uppercase tracking-wider font-semibold hover:bg-[#FACC15] transition-colors"
      >
        Continuar
      </button>
    </div>
  );
}
