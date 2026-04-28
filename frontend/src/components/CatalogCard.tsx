/**
 * CatalogCard — tarjeta visual de un item del catálogo.
 *
 * Spec:
 *   - Orquestor.md §FASE 2 + §Sistema de Diseño Tech-Gold Luxury
 *   - UI_UX_SPEC.md (paleta, hover states)
 *   - R2 No `any`. Props tipadas con CatalogItem
 *
 * Diseño:
 *   - Fondo #0a0a0a, borde dorado sutil rgba(197,160,89,0.2).
 *   - Hover: translateY(-4px) + glow dorado en el borde.
 *   - Sin stock → CTA deshabilitada y badge "AGOTADO".
 *   - Imagen rota → placeholder con icono lucide-react.
 *
 * Componente puro: no conoce el cliente HTTP. La acción "add to cart"
 * llega como prop (`onAddToCart`) para que CatalogSection conecte el
 * CartContext.
 */

import { Image as ImageIcon, ShoppingCart } from 'lucide-react';
import { useState } from 'react';

import type { CatalogTipo, UUID } from '../types';

// ─── Mirror tipado del CatalogItemOut backend ────────────────────────────

export interface CatalogItem {
  id: UUID;
  name: string;
  description: string | null;
  tipo: CatalogTipo;
  price: string;        // Decimal serializado como string ("150.00")
  stock: number;
  image_url: string | null;
  is_active: boolean;
  is_in_stock: boolean;
  created_at: string;
}

interface CatalogCardProps {
  item: CatalogItem;
  onAddToCart: (item: CatalogItem) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<CatalogTipo, string> = {
  router: 'Router',
  camara: 'Cámara',
  equipo_red: 'Equipo de red',
  accesorio: 'Accesorio',
};

function formatPrice(price: string): string {
  // El backend manda Decimal-as-string; lo formateamos sin volver a Number.
  const [intPart, decPart = '00'] = price.split('.');
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${withSeparators}.${decPart.padEnd(2, '0').slice(0, 2)}`;
}

// ─── Component ────────────────────────────────────────────────────────────

export function CatalogCard({ item, onAddToCart }: CatalogCardProps): JSX.Element {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(item.image_url) && !imageBroken;
  const disabled = !item.is_in_stock;

  return (
    <article
      className={[
        'group relative flex flex-col overflow-hidden rounded-2xl',
        'bg-[#0a0a0a] border border-[rgba(197,160,89,0.2)]',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:-translate-y-1 hover:border-[#C5A059]',
        'hover:shadow-[0_0_30px_-5px_rgba(197,160,89,0.4)]',
      ].join(' ')}
    >
      {/* Imagen / placeholder */}
      <div className="relative aspect-[4/3] w-full bg-[#050505] overflow-hidden">
        {showImage ? (
          <img
            src={item.image_url ?? ''}
            alt={item.name}
            loading="lazy"
            onError={() => setImageBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/20">
            <ImageIcon size={64} strokeWidth={1.2} aria-hidden />
          </div>
        )}

        {/* Badge tipo */}
        <span
          className={[
            'absolute top-3 left-3 px-2.5 py-1 rounded-full',
            'text-[10px] uppercase tracking-wider font-semibold',
            'bg-black/70 backdrop-blur-sm border border-[rgba(197,160,89,0.3)]',
            'text-[#C5A059]',
          ].join(' ')}
        >
          {TIPO_LABEL[item.tipo]}
        </span>

        {/* Badge agotado */}
        {disabled && (
          <span
            className={[
              'absolute top-3 right-3 px-2.5 py-1 rounded-full',
              'text-[10px] uppercase tracking-wider font-semibold',
              'bg-[#DC3545]/90 text-white',
            ].join(' ')}
          >
            Agotado
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-[Archivo_Black] text-lg leading-tight text-white">
          {item.name}
        </h3>

        {item.description && (
          <p className="text-sm text-white/50 line-clamp-2">{item.description}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/30">
              Precio
            </p>
            <p className="font-[Archivo_Black] text-2xl text-[#FACC15]">
              {formatPrice(item.price)}
            </p>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onAddToCart(item)}
            aria-label={`Agregar ${item.name} al carrito`}
            className={[
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg',
              'text-xs uppercase tracking-wider font-semibold',
              'transition-all duration-200',
              disabled
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-[#C5A059] text-black hover:bg-[#FACC15] hover:shadow-[0_0_20px_-2px_rgba(250,204,21,0.5)]',
            ].join(' ')}
          >
            <ShoppingCart size={14} strokeWidth={2.5} aria-hidden />
            {disabled ? 'Sin stock' : 'Añadir'}
          </button>
        </div>
      </div>
    </article>
  );
}
