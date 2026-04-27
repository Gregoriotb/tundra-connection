/**
 * Tipos TypeScript — mirror de los schemas Pydantic del backend.
 *
 * Spec:
 *   - Orquestor.md §FASE 1
 *   - R2 Type safety total: NUNCA `any`, `unknown` sin narrowing, ni `@ts-ignore`
 *   - R14 Mirror exacto del backend (DATABASE_SCHEMA.md + schemas/user.py)
 *
 * Reglas de mantenimiento:
 *   - Si cambia un schema en el backend, actualizar AQUÍ en el mismo PR.
 *   - Para tipos compartidos por varios features, exportarlos desde este index.
 */

// ─── Identidades / primitives ─────────────────────────────────────────────

export type UUID = string;            // backend: uuid.UUID → str sobre la wire
export type ISODateTime = string;     // backend: datetime → ISO 8601 string

// ─── Enums espejo de los CHECK constraints del DDL ────────────────────────

export type AccountType = 'empresa' | 'particular';

export type CatalogTipo = 'router' | 'camara' | 'equipo_red' | 'accesorio';

export type ServiceSlug = 'fibra_optica' | 'satelital' | 'servicios_extras';

export type InvoiceTipo =
  | 'PRODUCT_SALE'
  | 'INTERNET_SERVICE'
  | 'SERVICE_QUOTATION';

export type InvoiceEstado =
  | 'pending'
  | 'paid'
  | 'cancelled'
  | 'overdue'
  | 'refunded';

export type QuotationEstado =
  | 'pending'
  | 'active'
  | 'quoted'
  | 'negotiating'
  | 'closed'
  | 'cancelled';

export type ChatMessageType = 'text' | 'system' | 'attachment';

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

// ─── Identifier reservado para bootstrap admin (mirror schemas/user.py) ───

export const ADMIN_IDENTIFIER = 'admin' as const;
export type AdminIdentifier = typeof ADMIN_IDENTIFIER;

// ─── User ─────────────────────────────────────────────────────────────────

/** Mirror de UserOut (backend/app/schemas/user.py). */
export interface User {
  id: UUID;
  email: string;
  is_admin: boolean;
  account_type: AccountType | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  rif_cedula: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  profile_photo_url: string | null;
  is_active: boolean;
  email_verified: boolean;
  has_completed_onboarding: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** Mirror de UserPublicOut. */
export interface UserPublic {
  id: UUID;
  first_name: string | null;
  last_name: string | null;
  profile_photo_url: string | null;
}

// ─── Auth ─────────────────────────────────────────────────────────────────

/** Mirror de UserRegisterIn (request body). */
export interface RegisterPayload {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  account_type?: AccountType;
}

/** Mirror de UserLoginIn — admite "admin" como identifier. */
export interface LoginPayload {
  email: string | AdminIdentifier;
  password: string;
}

/** Mirror de UserUpdateIn (PATCH/PUT /users/profile). */
export interface UserUpdatePayload {
  first_name?: string;
  last_name?: string;
  phone?: string;
  rif_cedula?: string;
  account_type?: AccountType;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

/** Mirror de PasswordChangeIn. */
export interface PasswordChangePayload {
  current_password: string;
  new_password: string;
}

/** Mirror de AuthTokensOut. */
export interface AuthTokens {
  access_token: string;
  refresh_token: string | null;
  token_type: 'bearer';
  expires_in: number;
  user: User;
}

// ─── Errores estandarizados de FastAPI ────────────────────────────────────

/** Forma de los 422 de FastAPI/Pydantic v2. */
export interface ValidationErrorItem {
  type: string;
  loc: (string | number)[];
  msg: string;
  input?: unknown;
}

export interface ValidationErrorResponse {
  detail: ValidationErrorItem[];
}

/** Forma de los 4xx/5xx con `detail` simple. */
export interface ApiErrorResponse {
  detail: string;
}
