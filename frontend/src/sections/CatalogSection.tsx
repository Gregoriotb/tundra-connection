/**
 * CatalogSection — sección de productos en el landing.
 *
 * Spec:
 *   - Orquestor.md §FASE 2 + §Sistema de Diseño Tech-Gold Luxury
 *   - R2 No `any`. Tipos importados.
 *   - R10 No polling — un solo fetch al montar; los cambios admin requieren
 *     refresh manual del usuario hasta que llegue WebSocket en FASE 5.
 *
 * Estados que maneja:
 *   - 'loading'  → skeletons placeholders animados
 *   - 'error'    → mensaje + botón retry
 *   - 'empty'    → estado vacío con CTA para admins
 *   - 'ready'    → grid de CatalogCard
 *
 * Toast de "agregado al carrito" se mantiene local (no necesita librería
 * externa todavía; cuando lleguen notificaciones en FASE 5 lo unificamos).
 */

import { AlertTriangle, PackageOpen, ShoppingCart } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { CatalogCard, type CatalogItem } from '../components/CatalogCard';
import { useCart } from '../contexts/CartContext';
import { ApiError, catalogApi } from '../services/api';

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CatalogItem[] };

const SKELETON_COUNT = 4;

// ─── Subcomponentes ───────────────────────────────────────────────────────

function CatalogSkeleton(): JSX.Element {
  return (
    <div
      className="rounded-2xl bg-[#0a0a0a] border border-[rgba(197,160,89,0.1)] overflow-hidden animate-pulse"
      aria-hidden
    >
      <div className="aspect-[4/3] bg-white/5" />
      <div className="p-5 space-y-3">
        <div className="h-5 w-3/4 bg-white/5 rounded" />
        <div className="h-3 w-full bg-white/5 rounded" />
        <div className="h-3 w-2/3 bg-white/5 rounded" />
        <div className="h-10 w-full bg-white/5 rounded mt-4" />
      </div>
    </div>
  );
}

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

function Toast({ message, onDismiss }: ToastProps): JSX.Element {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, 2400);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed bottom-6 right-6 z-50 flex items-center gap-2',
        'px-4 py-3 rounded-lg backdrop-blur-md',
        'bg-black/80 border border-[#C5A059]',
        'text-white text-sm shadow-[0_0_30px_-5px_rgba(197,160,89,0.5)]',
        'animate-[fade-in_200ms_ease-out]',
      ].join(' ')}
    >
      <ShoppingCart size={16} className="text-[#C5A059]" aria-hidden />
      {message}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export function CatalogSection(): JSX.Element {
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [toast, setToast] = useState<string | null>(null);
  const { add } = useCart();

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await catalogApi.list();
      setState({ status: 'ready', items: res.items });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudo cargar el catálogo';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddToCart = useCallback(
    (item: CatalogItem) => {
      add(item, 1);
      setToast(`${item.name} añadido al carrito`);
    },
    [add],
  );

  return (
    <section
      id="catalogo"
      className="relative py-20 px-6 lg:px-12 bg-[#050505] text-white"
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center lg:text-left">
          <p className="text-xs uppercase tracking-[0.3em] text-[#C5A059] mb-3">
            Equipos
          </p>
          <h2 className="font-[Archivo_Black] text-4xl lg:text-5xl mb-4">
            Catálogo de productos
          </h2>
          <p className="text-white/50 max-w-2xl text-base lg:text-lg">
            Routers, cámaras y equipos de red seleccionados para complementar tus
            servicios de internet. Selección curada — máximo diez productos.
          </p>
        </header>

        {/* Body */}
        {state.status === 'loading' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <CatalogSkeleton key={i} />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <AlertTriangle size={48} className="text-[#DC3545]" aria-hidden />
            <p className="text-white/70">{state.message}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="px-5 py-2 rounded-lg border border-[#C5A059] text-[#C5A059] hover:bg-[#C5A059] hover:text-black transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {state.status === 'ready' && state.items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-white/40">
            <PackageOpen size={48} aria-hidden />
            <p>Aún no hay productos publicados.</p>
          </div>
        )}

        {state.status === 'ready' && state.items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {state.items.map((item) => (
              <CatalogCard
                key={item.id}
                item={item}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </section>
  );
}
