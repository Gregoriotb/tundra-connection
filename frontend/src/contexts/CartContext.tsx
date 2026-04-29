/**
 * CartContext — estado global del carrito de compras (productos físicos).
 *
 * Spec:
 *   - Orquestor.md §FASE 2 + §FASE 3 (checkout PRODUCT_SALE)
 *   - R2 No `any`. Tipos importados de ../types y CatalogCard
 *   - R9 Aritmética monetaria entera (centavos) — nunca floats
 *
 * Diseño:
 *   - Estado en `useReducer` (acciones explícitas, debug fácil).
 *   - Persistencia en `localStorage` (clave "tundra.cart").
 *   - Aritmética en CENTAVOS (entero) → suma exacta, sin errores de float.
 *   - El checkout HTTP llega en FASE 3; este contexto expone
 *     `getCheckoutPayload()` listo para enviar a /invoices/checkout.
 */

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';

import type { CatalogItem } from '../components/CatalogCard';
import type { UUID } from '../types';

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface CartLine {
  item_id: UUID;
  name: string;
  unit_price: string;   // Decimal-as-string ("150.00") — preserva precisión
  quantity: number;
  image_url: string | null;
  max_stock: number;
}

export interface CartTotals {
  subtotal: string;     // Decimal-as-string formateado
  itemCount: number;    // Suma de quantities
  lineCount: number;    // Cantidad de líneas distintas
}

export interface CheckoutPayload {
  tipo: 'PRODUCT_SALE';
  items: Array<{
    item_id: UUID;
    quantity: number;
    unit_price: string;
  }>;
}

interface CartState {
  lines: CartLine[];
}

type CartAction =
  | { type: 'ADD'; item: CatalogItem; quantity: number }
  | { type: 'REMOVE'; itemId: UUID }
  | { type: 'SET_QTY'; itemId: UUID; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; lines: CartLine[] };

// ─── Aritmética monetaria en centavos ─────────────────────────────────────

function toCents(decimalStr: string): number {
  // "150.00" → 15000. "150" → 15000. "150.5" → 15050.
  const [intPart, decPart = ''] = decimalStr.split('.');
  const cents = (decPart + '00').slice(0, 2);
  const sign = intPart.startsWith('-') ? -1 : 1;
  const intAbs = intPart.replace('-', '');
  return sign * (Number.parseInt(intAbs || '0', 10) * 100 + Number.parseInt(cents, 10));
}

function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const decPart = (abs % 100).toString().padStart(2, '0');
  return `${sign}${intPart}.${decPart}`;
}

// ─── Reducer ──────────────────────────────────────────────────────────────

function clampQty(qty: number, max: number): number {
  if (!Number.isFinite(qty) || qty < 1) return 1;
  if (qty > max) return max;
  return Math.floor(qty);
}

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { lines: action.lines };

    case 'ADD': {
      const existing = state.lines.find((l) => l.item_id === action.item.id);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.item_id === action.item.id
              ? { ...l, quantity: clampQty(l.quantity + action.quantity, action.item.stock) }
              : l,
          ),
        };
      }
      const newLine: CartLine = {
        item_id: action.item.id,
        name: action.item.name,
        unit_price: action.item.price,
        quantity: clampQty(action.quantity, action.item.stock),
        image_url: action.item.image_url,
        max_stock: action.item.stock,
      };
      return { lines: [...state.lines, newLine] };
    }

    case 'REMOVE':
      return { lines: state.lines.filter((l) => l.item_id !== action.itemId) };

    case 'SET_QTY':
      return {
        lines: state.lines
          .map((l) =>
            l.item_id === action.itemId
              ? { ...l, quantity: clampQty(action.quantity, l.max_stock) }
              : l,
          )
          .filter((l) => l.quantity > 0),
      };

    case 'CLEAR':
      return { lines: [] };

    default:
      return state;
  }
}

// ─── Persistencia ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'tundra.cart';

function loadFromStorage(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Narrowing defensivo — si el shape cambió entre versiones, descartamos.
    return parsed.filter(
      (l): l is CartLine =>
        typeof l === 'object' &&
        l !== null &&
        typeof l.item_id === 'string' &&
        typeof l.unit_price === 'string' &&
        typeof l.quantity === 'number',
    );
  } catch {
    return [];
  }
}

function saveToStorage(lines: CartLine[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // QuotaExceeded u otros — el carrito sigue funcionando en memoria.
  }
}

// ─── Context ──────────────────────────────────────────────────────────────

export interface CartContextValue {
  lines: CartLine[];
  totals: CartTotals;
  isEmpty: boolean;
  add: (item: CatalogItem, quantity?: number) => void;
  remove: (itemId: UUID) => void;
  setQuantity: (itemId: UUID, quantity: number) => void;
  clear: () => void;
  getCheckoutPayload: () => CheckoutPayload;
}

const CartContext = createContext<CartContextValue | null>(null);

interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(reducer, { lines: [] });

  // Hidrata desde localStorage al montar.
  useEffect(() => {
    const lines = loadFromStorage();
    if (lines.length > 0) {
      dispatch({ type: 'HYDRATE', lines });
    }
  }, []);

  // Persiste cada cambio.
  useEffect(() => {
    saveToStorage(state.lines);
  }, [state.lines]);

  const totals = useMemo<CartTotals>(() => {
    const subtotalCents = state.lines.reduce(
      (sum, l) => sum + toCents(l.unit_price) * l.quantity,
      0,
    );
    const itemCount = state.lines.reduce((sum, l) => sum + l.quantity, 0);
    return {
      subtotal: fromCents(subtotalCents),
      itemCount,
      lineCount: state.lines.length,
    };
  }, [state.lines]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      totals,
      isEmpty: state.lines.length === 0,
      add: (item, quantity = 1) => dispatch({ type: 'ADD', item, quantity }),
      remove: (itemId) => dispatch({ type: 'REMOVE', itemId }),
      setQuantity: (itemId, quantity) =>
        dispatch({ type: 'SET_QTY', itemId, quantity }),
      clear: () => dispatch({ type: 'CLEAR' }),
      getCheckoutPayload: () => ({
        tipo: 'PRODUCT_SALE',
        items: state.lines.map((l) => ({
          item_id: l.item_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
      }),
    }),
    [state.lines, totals],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (ctx === null) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return ctx;
}
