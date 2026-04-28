/**
 * Axios instance + clientes tipados para el backend Tundra.
 *
 * Spec:
 *   - Orquestor.md §FASE 1
 *   - R2 No `any`. Todas las respuestas tipadas con interfaces de ../types
 *   - R3 JWT Bearer en cada request autenticado
 *   - R8 CORS: el backend acepta credentials → withCredentials=true
 *   - R13 Logging mínimo en consola (solo dev). Cero secrets.
 *
 * Token storage: `localStorage` clave `tundra.access_token`.
 *   - Trade-off conocido: vulnerable a XSS pero R11 (CSP/headers) lo mitiga.
 *   - Alternativa httpOnly cookie se evaluará si el threat model cambia.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';

import type { CatalogItem } from '../components/CatalogCard';
import type { Service } from '../components/ServiceCard';
import type {
  ApiErrorResponse,
  AuthTokens,
  LoginPayload,
  PasswordChangePayload,
  RegisterPayload,
  User,
  UserUpdatePayload,
  ValidationErrorResponse,
} from '../types';

// ─── Config ───────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const TOKEN_KEY = 'tundra.access_token';
const REFRESH_KEY = 'tundra.refresh_token';

// ─── Token helpers ────────────────────────────────────────────────────────

export const tokenStorage = {
  getAccess(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(tokens: AuthTokens): void {
    localStorage.setItem(TOKEN_KEY, tokens.access_token);
    if (tokens.refresh_token) {
      localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    }
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ─── Errores tipados ──────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly fieldErrors: Record<string, string> | null;

  constructor(
    status: number,
    detail: string,
    fieldErrors: Record<string, string> | null = null,
  ) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }
}

function isValidationError(
  data: unknown,
): data is ValidationErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'detail' in data &&
    Array.isArray((data as { detail: unknown }).detail)
  );
}

function normalizeError(err: AxiosError): ApiError {
  if (!err.response) {
    return new ApiError(0, 'Network error');
  }
  const { status, data } = err.response;

  if (isValidationError(data)) {
    const fieldErrors: Record<string, string> = {};
    for (const item of data.detail) {
      const key = item.loc.filter((p) => p !== 'body').join('.');
      fieldErrors[key || 'root'] = item.msg;
    }
    return new ApiError(status, 'Validation error', fieldErrors);
  }

  if (
    typeof data === 'object' &&
    data !== null &&
    'detail' in data &&
    typeof (data as ApiErrorResponse).detail === 'string'
  ) {
    return new ApiError(status, (data as ApiErrorResponse).detail);
  }

  return new ApiError(status, err.message || 'Request failed');
}

// ─── Instance ─────────────────────────────────────────────────────────────

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccess();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
);

// Hook que el AuthContext registra para reaccionar a 401 globalmente.
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(fn: UnauthorizedHandler): void {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const apiErr = normalizeError(err);
    if (apiErr.status === 401) {
      tokenStorage.clear();
      onUnauthorized?.();
    }
    return Promise.reject(apiErr);
  },
);

// ─── Auth client ──────────────────────────────────────────────────────────

async function post<TBody, TResp>(
  url: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResp> {
  const res = await api.post<TResp>(url, body, config);
  return res.data;
}

async function get<TResp>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<TResp> {
  const res = await api.get<TResp>(url, config);
  return res.data;
}

async function put<TBody, TResp>(
  url: string,
  body: TBody,
): Promise<TResp> {
  const res = await api.put<TResp>(url, body);
  return res.data;
}

export const authApi = {
  register(payload: RegisterPayload): Promise<AuthTokens> {
    return post<RegisterPayload, AuthTokens>('/auth/register', payload);
  },
  login(payload: LoginPayload): Promise<AuthTokens> {
    return post<LoginPayload, AuthTokens>('/auth/login', payload);
  },
  verify(): Promise<User> {
    return get<User>('/auth/verify');
  },
  logout(): Promise<void> {
    return post<Record<string, never>, void>('/auth/logout', {});
  },
  changePassword(payload: PasswordChangePayload): Promise<void> {
    return post<PasswordChangePayload, void>('/auth/password', payload);
  },
};

export const usersApi = {
  getProfile(): Promise<User> {
    return get<User>('/users/profile');
  },
  updateProfile(payload: UserUpdatePayload): Promise<User> {
    return put<UserUpdatePayload, User>('/users/profile', payload);
  },
};

// ─── Catalog ──────────────────────────────────────────────────────────────

interface CatalogListResponse {
  items: CatalogItem[];
  total: number;
}

export const catalogApi = {
  list(): Promise<CatalogListResponse> {
    return get<CatalogListResponse>('/catalog');
  },
  getById(id: string): Promise<CatalogItem> {
    return get<CatalogItem>(`/catalog/${id}`);
  },
};

// ─── Services ─────────────────────────────────────────────────────────────

interface ServiceListResponse {
  items: Service[];
  total: number;
}

export const servicesApi = {
  list(): Promise<ServiceListResponse> {
    return get<ServiceListResponse>('/services');
  },
  getBySlug(slug: string): Promise<Service> {
    return get<Service>(`/services/${slug}`);
  },
};

// ─── Invoices ─────────────────────────────────────────────────────────────

export interface ProductSaleCheckoutBody {
  tipo: 'PRODUCT_SALE';
  items: Array<{
    item_id: string;
    quantity: number;
    unit_price?: string;
  }>;
}

export interface InternetServiceCheckoutBody {
  tipo: 'INTERNET_SERVICE';
  service_id: string;
  plan_id: string;
  direccion_instalacion: string;
}

export type CheckoutBody = ProductSaleCheckoutBody | InternetServiceCheckoutBody;

export interface Invoice {
  id: string;
  user_id: string;
  tipo: 'PRODUCT_SALE' | 'INTERNET_SERVICE' | 'SERVICE_QUOTATION';
  estado: 'pending' | 'paid' | 'cancelled' | 'overdue' | 'refunded';
  subtotal: string;
  tax_amount: string;
  total: string;
  items: Array<Record<string, unknown>>;
  direccion_instalacion: string | null;
  plan_seleccionado: Record<string, unknown> | null;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

interface InvoiceListResponse {
  items: Invoice[];
  total: number;
}

export const invoicesApi = {
  checkout(body: CheckoutBody): Promise<Invoice> {
    return post<CheckoutBody, Invoice>('/invoices/checkout', body);
  },
  myInvoices(): Promise<InvoiceListResponse> {
    return get<InvoiceListResponse>('/invoices/my-invoices');
  },
  getById(id: string): Promise<Invoice> {
    return get<Invoice>(`/invoices/${id}`);
  },
};
