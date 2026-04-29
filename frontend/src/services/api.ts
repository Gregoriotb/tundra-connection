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
  async uploadPhoto(file: File): Promise<User> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<User>('/users/profile/photo-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  async uploadRif(file: File): Promise<User> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<User>('/users/profile/rif-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

export const oauthApi = {
  googleLoginUrl(): Promise<{
    authorize_url: string;
    state?: string;
    configured: string;
  }> {
    return get<{ authorize_url: string; state?: string; configured: string }>(
      '/auth/google/login',
    );
  },
};

// ─── Catalog ──────────────────────────────────────────────────────────────

interface CatalogListResponse {
  items: CatalogItem[];
  total: number;
}

export interface CatalogItemCreateBody {
  name: string;
  description?: string | null;
  tipo: 'router' | 'camara' | 'equipo_red' | 'accesorio';
  price: string;
  stock: number;
  image_url?: string | null;
  is_active?: boolean;
}

export type CatalogItemUpdateBody = Partial<CatalogItemCreateBody>;

export const catalogApi = {
  list(): Promise<CatalogListResponse> {
    return get<CatalogListResponse>('/catalog');
  },
  getById(id: string): Promise<CatalogItem> {
    return get<CatalogItem>(`/catalog/${id}`);
  },
  adminCreate(body: CatalogItemCreateBody): Promise<CatalogItem> {
    return post<CatalogItemCreateBody, CatalogItem>('/admin/catalog', body);
  },
  adminUpdate(id: string, body: CatalogItemUpdateBody): Promise<CatalogItem> {
    return put<CatalogItemUpdateBody, CatalogItem>(`/admin/catalog/${id}`, body);
  },
  async adminDelete(id: string): Promise<void> {
    await api.delete(`/admin/catalog/${id}`);
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

export type InvoiceEstado = Invoice['estado'];

export interface InvoiceUpdateStatusBody {
  estado: InvoiceEstado;
  nota?: string | null;
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
  adminList(filters?: {
    estado?: InvoiceEstado;
    tipo?: Invoice['tipo'];
    user_id?: string;
  }): Promise<InvoiceListResponse> {
    const params = new URLSearchParams();
    if (filters?.estado) params.set('estado', filters.estado);
    if (filters?.tipo) params.set('tipo', filters.tipo);
    if (filters?.user_id) params.set('user_id', filters.user_id);
    const qs = params.toString();
    return get<InvoiceListResponse>(`/admin/invoices${qs ? `?${qs}` : ''}`);
  },
  adminUpdateStatus(id: string, body: InvoiceUpdateStatusBody): Promise<Invoice> {
    return api
      .patch<Invoice>(`/admin/invoices/${id}/status`, body)
      .then((r) => r.data);
  },
};

// ─── Chat-Cotizaciones ────────────────────────────────────────────────────

import type { ChatMessageData } from '../components/ChatMessage';

export interface QuotationThread {
  id: string;
  user_id: string;
  service_id: string | null;
  estado:
    | 'pending'
    | 'active'
    | 'quoted'
    | 'negotiating'
    | 'closed'
    | 'cancelled';
  presupuesto_estimado: string | null;
  requerimiento_inicial: string | null;
  direccion: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    profile_photo_url: string | null;
    is_admin: boolean;
  };
  last_message_preview: string | null;
  unread_count: number;
}

export interface QuotationThreadDetail extends QuotationThread {
  messages: ChatMessageData[];
}

interface ThreadListResponse {
  items: QuotationThread[];
  total: number;
}

export interface CreateThreadBody {
  service_id: string;
  requerimiento_inicial: string;
  direccion?: string;
  presupuesto_estimado?: string;
}

export interface CreateMessageBody {
  content: string;
  message_type?: 'text';
}

export const chatApi = {
  createThread(body: CreateThreadBody): Promise<QuotationThread> {
    return post<CreateThreadBody, QuotationThread>(
      '/chat-quotations/threads',
      body,
    );
  },
  myThreads(): Promise<ThreadListResponse> {
    return get<ThreadListResponse>('/chat-quotations/my-threads');
  },
  getThread(id: string): Promise<QuotationThreadDetail> {
    return get<QuotationThreadDetail>(`/chat-quotations/threads/${id}`);
  },
  postMessage(threadId: string, body: CreateMessageBody): Promise<ChatMessageData> {
    return post<CreateMessageBody, ChatMessageData>(
      `/chat-quotations/threads/${threadId}/messages`,
      body,
    );
  },
  adminListThreads(estado?: QuotationThread['estado']): Promise<ThreadListResponse> {
    const qs = estado ? `?estado=${encodeURIComponent(estado)}` : '';
    return get<ThreadListResponse>(`/admin/threads${qs}`);
  },
  adminUpdateStatus(
    id: string,
    body: ThreadUpdateStatusBody,
  ): Promise<QuotationThread> {
    return api
      .patch<QuotationThread>(`/admin/threads/${id}/status`, body)
      .then((r) => r.data);
  },
};

export interface ThreadUpdateStatusBody {
  estado: QuotationThread['estado'];
  presupuesto_estimado?: string | null;
  nota?: string | null;
}

// ─── Notifications ────────────────────────────────────────────────────────

export type NotificationTipo =
  | 'chat_message'
  | 'quotation_status'
  | 'invoice_created'
  | 'ticket_updated'
  | 'ticket_assigned';

export interface Notification {
  id: string;
  user_id: string;
  tipo: NotificationTipo;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  is_read: boolean;
}

interface NotificationListResponse {
  items: Notification[];
  total: number;
}

interface UnreadCountResponse {
  unread: number;
}

export const notificationsApi = {
  list(onlyUnread = false, limit = 50): Promise<NotificationListResponse> {
    const params = new URLSearchParams();
    if (onlyUnread) params.set('only_unread', 'true');
    params.set('limit', String(limit));
    return get<NotificationListResponse>(`/notifications?${params.toString()}`);
  },
  unreadCount(): Promise<UnreadCountResponse> {
    return get<UnreadCountResponse>('/notifications/unread-count');
  },
  markRead(id: string): Promise<Notification> {
    return put<Record<string, never>, Notification>(
      `/notifications/${id}/read`,
      {},
    );
  },
  markAllRead(): Promise<UnreadCountResponse> {
    return put<Record<string, never>, UnreadCountResponse>(
      '/notifications/mark-all-read',
      {},
    );
  },
  remove(id: string): Promise<void> {
    return api.delete(`/notifications/${id}`).then(() => undefined);
  },
};

// ─── Support Tickets ──────────────────────────────────────────────────────

export type TicketTipo = 'incidencia' | 'requerimiento';
export type TicketServicio =
  | 'fibra_optica'
  | 'satelital'
  | 'servicios_extras'
  | 'otro';
export type TicketEstado =
  | 'abierto'
  | 'en_revision'
  | 'remitido'
  | 'en_proceso'
  | 'solucionado'
  | 'cancelado';
export type TicketPrioridad = 'baja' | 'media' | 'alta' | 'critica';

export interface TicketAuthor {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_photo_url: string | null;
  is_admin: boolean;
}

export interface TicketAttachment {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface HistorialEntry {
  kind: 'status_change' | 'reply' | 'internal_note' | 'assign';
  from_estado?: string;
  to_estado?: string;
  by_user_id?: string;
  nota?: string;
  at: string;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  tipo: TicketTipo;
  servicio_relacionado: TicketServicio;
  estado: TicketEstado;
  prioridad: TicketPrioridad;
  titulo: string;
  descripcion: string;
  adjuntos: TicketAttachment[];
  assigned_to: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user: TicketAuthor;
  assignee: TicketAuthor | null;
}

export interface SupportTicketDetail extends SupportTicket {
  notas_internas: string | null;
  historial_estados: HistorialEntry[];
}

interface TicketListResponse {
  items: SupportTicket[];
  total: number;
}

export interface CreateTicketBody {
  tipo: TicketTipo;
  servicio_relacionado: TicketServicio;
  titulo: string;
  descripcion: string;
  prioridad?: TicketPrioridad;
}

export interface ReplyTicketBody {
  content: string;
}

export interface UpdateStatusBody {
  estado: TicketEstado;
  nota?: string;
}

export interface AssignBody {
  assigned_to: string | null;
}

export interface InternalNoteBody {
  nota: string;
}

export const ticketsApi = {
  // Cliente
  create(body: CreateTicketBody): Promise<SupportTicket> {
    return post<CreateTicketBody, SupportTicket>('/support-tickets', body);
  },
  myTickets(): Promise<TicketListResponse> {
    return get<TicketListResponse>('/support-tickets/my-tickets');
  },
  getMine(id: string): Promise<SupportTicket> {
    return get<SupportTicket>(`/support-tickets/${id}`);
  },
  reply(id: string, body: ReplyTicketBody): Promise<SupportTicket> {
    return post<ReplyTicketBody, SupportTicket>(
      `/support-tickets/${id}/reply`,
      body,
    );
  },
  // Admin
  adminList(filters?: {
    estado?: string;
    prioridad?: string;
    assigned_to_me?: boolean;
  }): Promise<TicketListResponse> {
    const params = new URLSearchParams();
    if (filters?.estado) params.set('estado', filters.estado);
    if (filters?.prioridad) params.set('prioridad', filters.prioridad);
    if (filters?.assigned_to_me) params.set('assigned_to_me', 'true');
    const qs = params.toString();
    return get<TicketListResponse>(
      `/admin/support-tickets${qs ? `?${qs}` : ''}`,
    );
  },
  adminGet(id: string): Promise<SupportTicketDetail> {
    return get<SupportTicketDetail>(`/admin/support-tickets/${id}`);
  },
  adminUpdateStatus(id: string, body: UpdateStatusBody): Promise<SupportTicketDetail> {
    return api
      .patch<SupportTicketDetail>(`/admin/support-tickets/${id}/status`, body)
      .then((r) => r.data);
  },
  adminAssign(id: string, body: AssignBody): Promise<SupportTicketDetail> {
    return api
      .patch<SupportTicketDetail>(`/admin/support-tickets/${id}/assign`, body)
      .then((r) => r.data);
  },
  adminInternalNote(id: string, body: InternalNoteBody): Promise<SupportTicketDetail> {
    return post<InternalNoteBody, SupportTicketDetail>(
      `/admin/support-tickets/${id}/internal-note`,
      body,
    );
  },
};

// ─── Admin (FASE 8) ───────────────────────────────────────────────────────

export interface StatsCard {
  key: string;
  label: string;
  value: number | string;
  delta_pct: number | null;
  tone: 'neutral' | 'good' | 'warn' | 'danger';
}

export interface AdminStats {
  cards: StatsCard[];
  generated_at: string;
}

export interface AdminExportAll {
  generated_at: string;
  counts: Record<string, number>;
  invoices_total_amount: string;
  open_tickets: number;
  pending_quotations: number;
  active_api_keys: number;
}

export type ApiKeyScope = 'read' | 'write' | 'admin';

export interface ApiKeyItem {
  id: string;
  user_id: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  is_usable: boolean;
}

export interface ApiKeyListResponse {
  items: ApiKeyItem[];
  total: number;
}

export interface ApiKeyCreateBody {
  name: string;
  user_id?: string;
  scopes?: ApiKeyScope[];
  expires_at?: string | null;
}

export interface ApiKeyCreatedResponse {
  api_key: ApiKeyItem;
  plain_key: string;
}

export const adminApi = {
  stats(): Promise<AdminStats> {
    return get<AdminStats>('/admin/stats');
  },
  exportAll(): Promise<AdminExportAll> {
    return get<AdminExportAll>('/admin/export-all');
  },
  listApiKeys(includeRevoked = false): Promise<ApiKeyListResponse> {
    return get<ApiKeyListResponse>(
      `/admin/api-keys${includeRevoked ? '?include_revoked=true' : ''}`,
    );
  },
  createApiKey(body: ApiKeyCreateBody): Promise<ApiKeyCreatedResponse> {
    return post<ApiKeyCreateBody, ApiKeyCreatedResponse>('/admin/api-keys', body);
  },
  async revokeApiKey(id: string): Promise<void> {
    await api.delete(`/admin/api-keys/${id}`);
  },
};
