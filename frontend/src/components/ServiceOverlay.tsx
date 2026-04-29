/**
 * ServiceOverlay — overlay full-screen con animación de prestigio.
 *
 * Spec:
 *   - Orquestor.md §FASE 3 + §Sistema de Diseño Tech-Gold Luxury
 *     · fade-in 300ms + scale 0.8→1.0 (400ms, cubic-bezier(0.16,1,0.3,1))
 *     · Stagger interno: 100ms entre elementos
 *   - R2 No `any`. Tipos importados de ServiceCard.
 *
 * Comportamiento:
 *   - Para fibra / satelital → muestra los planes y CTA "Seleccionar plan"
 *     que dispara `onSelectPlan` (lo conectará la sección con el modal de
 *     instalación / checkout).
 *   - Para servicios_extras → muestra CTA "Iniciar cotización" que en
 *     FASE 4 abrirá el chat-cotización. Por ahora dispara `onStartQuote`.
 *
 * UX:
 *   - Click fuera del panel cierra (overlay click).
 *   - Tecla Esc cierra.
 *   - Body scroll lock mientras está abierto.
 */

import { AnimatePresence, motion, type Variants } from 'framer-motion';
import {
  ArrowRight,
  Check,
  MessageSquare,
  X,
  type LucideIcon,
  Layers,
  Satellite,
  Settings,
  Wifi,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';

import type { InternetPlan, Service } from './ServiceCard';

// ─── Props ────────────────────────────────────────────────────────────────

interface ServiceOverlayProps {
  service: Service | null;
  onClose: () => void;
  onSelectPlan: (service: Service, plan: InternetPlan) => void;
  onStartQuote: (service: Service) => void;
}

// ─── Variants Framer Motion (curvas del spec) ─────────────────────────────

const SPEC_EASE = [0.16, 1, 0.3, 1] as const;

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: SPEC_EASE } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.4, ease: SPEC_EASE },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2, ease: SPEC_EASE },
  },
};

const contentVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: SPEC_EASE },
  },
};

// ─── Resolver iconos ──────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Wifi,
  Satellite,
  Settings,
  Layers,
};

function resolveIcon(name: string | null): LucideIcon {
  if (name && name in ICON_MAP) return ICON_MAP[name];
  return Layers;
}

function formatPrice(price: string): string {
  const [intPart, decPart = '00'] = price.split('.');
  return `$${intPart}.${decPart.padEnd(2, '0').slice(0, 2)}`;
}

// ─── Subcomponente: PlanCard ──────────────────────────────────────────────

interface PlanCardProps {
  plan: InternetPlan;
  onSelect: (plan: InternetPlan) => void;
}

function PlanCard({ plan, onSelect }: PlanCardProps): JSX.Element {
  const isEmpresarial = plan.tipo_plan === 'empresarial';
  return (
    <motion.div
      variants={itemVariants}
      className={[
        'relative flex flex-col gap-4 p-6 rounded-2xl',
        'bg-[#0a0a0a] border transition-all duration-300',
        isEmpresarial
          ? 'border-[rgba(250,204,21,0.3)] hover:border-[#FACC15]'
          : 'border-[rgba(197,160,89,0.2)] hover:border-[#C5A059]',
        'hover:shadow-[0_0_40px_-10px_rgba(197,160,89,0.4)]',
      ].join(' ')}
    >
      {isEmpresarial && (
        <span className="absolute -top-2 right-4 px-2.5 py-0.5 rounded-full bg-[#FACC15] text-black text-[10px] uppercase tracking-wider font-bold">
          Empresarial
        </span>
      )}

      <div className="flex items-baseline justify-between">
        <h4 className="font-[Archivo_Black] text-xl text-white">{plan.nombre}</h4>
        {plan.velocidad && (
          <span className="text-xs uppercase tracking-wider text-[#C5A059]">
            {plan.velocidad}
          </span>
        )}
      </div>

      <div>
        <p className="font-[Archivo_Black] text-3xl text-[#FACC15]">
          {formatPrice(plan.precio_mensual)}
          <span className="text-sm font-normal text-white/40 ml-1">/mes</span>
        </p>
      </div>

      {plan.caracteristicas.length > 0 && (
        <ul className="space-y-2">
          {plan.caracteristicas.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-white/60">
              <Check
                size={14}
                className="mt-0.5 flex-shrink-0 text-[#C5A059]"
                strokeWidth={3}
                aria-hidden
              />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onSelect(plan)}
        className={[
          'mt-auto inline-flex items-center justify-center gap-2',
          'px-4 py-3 rounded-lg text-sm uppercase tracking-wider font-semibold',
          'bg-[#C5A059] text-black transition-all duration-200',
          'hover:bg-[#FACC15] hover:shadow-[0_0_25px_-5px_rgba(250,204,21,0.6)]',
        ].join(' ')}
      >
        Seleccionar plan
        <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
      </button>
    </motion.div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export function ServiceOverlay({
  service,
  onClose,
  onSelectPlan,
  onStartQuote,
}: ServiceOverlayProps): JSX.Element {
  const isOpen = service !== null;
  const Icon = useMemo(
    () => resolveIcon(service?.icon_name ?? null),
    [service?.icon_name],
  );
  const isQuoteService = service?.slug === 'servicios_extras';

  // Esc para cerrar.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Body scroll lock.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && service && (
        <motion.div
          key="backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
          className={[
            'fixed inset-0 z-[100] flex items-center justify-center',
            'bg-black/85 backdrop-blur-md p-4 sm:p-8',
          ].join(' ')}
          role="dialog"
          aria-modal="true"
          aria-label={`Detalles del servicio ${service.name}`}
        >
          <motion.article
            key="panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={[
              'relative flex flex-col gap-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto',
              'rounded-3xl p-8 lg:p-12',
              'bg-[#050505] border border-[rgba(197,160,89,0.3)]',
              'shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]',
            ].join(' ')}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className={[
                'absolute top-4 right-4 p-2 rounded-lg',
                'text-white/40 hover:text-white hover:bg-white/5',
                'transition-colors',
              ].join(' ')}
            >
              <X size={20} aria-hidden />
            </button>

            <motion.div
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-8"
            >
              {/* Header */}
              <motion.header
                variants={itemVariants}
                className="flex flex-col sm:flex-row gap-6 items-start"
              >
                <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-[rgba(197,160,89,0.08)] border border-[rgba(197,160,89,0.3)] text-[#C5A059]">
                  <Icon size={40} strokeWidth={1.4} aria-hidden />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#C5A059] mb-2">
                    {isQuoteService ? 'Servicios técnicos' : 'Internet'}
                  </p>
                  <h2 className="font-[Archivo_Black] text-3xl lg:text-4xl text-white leading-tight mb-2">
                    {service.name}
                  </h2>
                  {service.subtitle && (
                    <p className="text-base text-white/60">{service.subtitle}</p>
                  )}
                </div>
              </motion.header>

              {/* Description */}
              {service.description && (
                <motion.p
                  variants={itemVariants}
                  className="text-base text-white/50 leading-relaxed max-w-3xl"
                >
                  {service.description}
                </motion.p>
              )}

              {/* Body — planes (fibra/satelital) o CTA quote (extras) */}
              {!isQuoteService && service.planes.length > 0 && (
                <motion.div
                  variants={itemVariants}
                  className="flex flex-col gap-4"
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-[Archivo_Black] text-lg text-white">
                      Planes disponibles
                    </h3>
                    {Number.parseFloat(service.precio_instalacion_base) > 0 && (
                      <p className="text-xs text-white/40">
                        Instalación base: {formatPrice(service.precio_instalacion_base)}
                      </p>
                    )}
                  </div>

                  <motion.div
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    {service.planes.map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        onSelect={(p) => onSelectPlan(service, p)}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {isQuoteService && (
                <motion.div
                  variants={itemVariants}
                  className="flex flex-col items-start gap-6 p-8 rounded-2xl bg-[#0a0a0a] border border-[rgba(197,160,89,0.2)]"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare
                      size={20}
                      className="text-[#C5A059]"
                      aria-hidden
                    />
                    <p className="text-sm uppercase tracking-wider text-[#C5A059]">
                      Cotización personalizada
                    </p>
                  </div>
                  <p className="text-base text-white/60 max-w-2xl">
                    Cada proyecto técnico tiene requerimientos únicos. Conversa
                    directamente con nuestro equipo para definir alcance, equipos
                    y presupuesto.
                  </p>
                  <button
                    type="button"
                    onClick={() => onStartQuote(service)}
                    className={[
                      'inline-flex items-center gap-2 px-6 py-3 rounded-lg',
                      'text-sm uppercase tracking-wider font-semibold',
                      'bg-[#C5A059] text-black transition-all duration-200',
                      'hover:bg-[#FACC15] hover:shadow-[0_0_30px_-5px_rgba(250,204,21,0.6)]',
                    ].join(' ')}
                  >
                    Iniciar cotización
                    <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
                  </button>
                </motion.div>
              )}
            </motion.div>
          </motion.article>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
