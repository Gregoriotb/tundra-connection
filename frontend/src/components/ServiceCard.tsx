/**
 * ServiceCard — card grande de servicio en el landing.
 *
 * Spec:
 *   - Orquestor.md §FASE 3 + §Sistema de Diseño Tech-Gold Luxury
 *   - R2 No `any`. Tipo `Service` espejo del backend.
 *
 * Diseño:
 *   - Más "prestige" que CatalogCard: padding amplio, icono grande dorado,
 *     hover con lift + glow + flecha que se mueve.
 *   - Click en cualquier parte de la card abre el ServiceOverlay.
 *   - Iconos lucide-react resueltos por `icon_name` del backend.
 *
 * Componente puro: el handler `onOpen` lo conecta ServicesSection.
 */

import {
  ArrowRight,
  Layers,
  Satellite,
  Settings,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';

import type { ServiceSlug, UUID } from '../types';

// ─── Mirror tipado del ServiceOut backend ─────────────────────────────────

export interface InternetPlan {
  id: string;
  nombre: string;
  velocidad: string | null;
  precio_mensual: string;     // Decimal-as-string
  tipo_plan: 'residencial' | 'empresarial' | 'personalizado';
  caracteristicas: string[];
}

export interface Service {
  id: UUID;
  slug: ServiceSlug;
  name: string;
  subtitle: string | null;
  description: string | null;
  icon_name: string | null;
  precio_instalacion_base: string;
  planes: InternetPlan[];
  is_active: boolean;
  display_order: number;
  created_at: string;
}

interface ServiceCardProps {
  service: Service;
  onOpen: (service: Service) => void;
}

// ─── Resolver de iconos ───────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Wifi,
  Satellite,
  Settings,
  Layers,
};

function resolveIcon(name: string | null): LucideIcon {
  if (name && name in ICON_MAP) return ICON_MAP[name];
  return Layers; // fallback neutral
}

// ─── Helpers de copy ──────────────────────────────────────────────────────

function buildPriceCopy(service: Service): string {
  if (service.slug === 'servicios_extras') {
    return 'Cotización personalizada';
  }
  if (service.planes.length === 0) {
    return 'Consultar';
  }
  // Encuentra el precio_mensual mínimo entre planes (string-decimal aware).
  const cents = service.planes
    .map((p) => {
      const [intPart, decPart = '00'] = p.precio_mensual.split('.');
      return Number.parseInt(intPart, 10) * 100 + Number.parseInt((decPart + '00').slice(0, 2), 10);
    })
    .filter((n) => Number.isFinite(n));
  if (cents.length === 0) return 'Consultar';
  const min = Math.min(...cents);
  const intPart = Math.floor(min / 100);
  const decPart = (min % 100).toString().padStart(2, '0');
  return `Desde $${intPart}.${decPart}/mes`;
}

// ─── Component ────────────────────────────────────────────────────────────

export function ServiceCard({ service, onOpen }: ServiceCardProps): JSX.Element {
  const Icon = useMemo(() => resolveIcon(service.icon_name), [service.icon_name]);
  const priceCopy = useMemo(() => buildPriceCopy(service), [service]);

  return (
    <button
      type="button"
      onClick={() => onOpen(service)}
      aria-label={`Abrir detalles de ${service.name}`}
      className={[
        'group relative flex flex-col items-start text-left',
        'rounded-3xl p-8 lg:p-10',
        'bg-[#0a0a0a] border border-[rgba(197,160,89,0.2)]',
        'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:-translate-y-2 hover:border-[#C5A059]',
        'hover:shadow-[0_20px_60px_-15px_rgba(197,160,89,0.5)]',
        'focus:outline-none focus-visible:border-[#FACC15]',
      ].join(' ')}
    >
      {/* Resplandor interno al hover */}
      <div
        aria-hidden
        className={[
          'pointer-events-none absolute inset-0 rounded-3xl',
          'bg-[radial-gradient(circle_at_top,rgba(197,160,89,0.12),transparent_60%)]',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-500',
        ].join(' ')}
      />

      {/* Icono dorado */}
      <div
        className={[
          'relative mb-6 inline-flex items-center justify-center',
          'h-16 w-16 rounded-2xl',
          'bg-[rgba(197,160,89,0.08)] border border-[rgba(197,160,89,0.3)]',
          'text-[#C5A059] transition-colors duration-300',
          'group-hover:text-[#FACC15] group-hover:border-[#FACC15]',
        ].join(' ')}
      >
        <Icon size={32} strokeWidth={1.5} aria-hidden />
      </div>

      {/* Eyebrow */}
      <p className="relative text-[10px] uppercase tracking-[0.3em] text-[#C5A059] mb-3">
        {service.slug === 'servicios_extras' ? 'Servicios técnicos' : 'Internet'}
      </p>

      {/* Título */}
      <h3 className="relative font-[Archivo_Black] text-2xl lg:text-3xl text-white leading-tight mb-2">
        {service.name}
      </h3>

      {/* Subtítulo */}
      {service.subtitle && (
        <p className="relative text-sm lg:text-base text-white/50 mb-6">
          {service.subtitle}
        </p>
      )}

      {/* Descripción corta */}
      {service.description && (
        <p className="relative text-sm text-white/40 leading-relaxed mb-8 line-clamp-3">
          {service.description}
        </p>
      )}

      {/* Footer con precio + arrow */}
      <div className="relative mt-auto flex items-center justify-between w-full pt-4 border-t border-white/5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">
            {service.slug === 'servicios_extras' ? 'Modelo' : 'Mensualidad'}
          </p>
          <p className="font-[Archivo_Black] text-lg text-[#FACC15]">
            {priceCopy}
          </p>
        </div>

        <span
          className={[
            'inline-flex items-center gap-1.5',
            'text-xs uppercase tracking-wider font-semibold',
            'text-[#C5A059] transition-all duration-300',
            'group-hover:text-[#FACC15] group-hover:gap-3',
          ].join(' ')}
        >
          Ver más
          <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
        </span>
      </div>
    </button>
  );
}
