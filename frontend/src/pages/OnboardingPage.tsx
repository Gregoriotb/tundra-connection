/**
 * OnboardingPage — completar perfil tras Google OAuth o registro mínimo.
 *
 * Spec:
 *   - Orquestor.md §FASE 7
 *   - R2 No `any`. Tipos importados.
 *   - R3 Auth requerida (gate explícito).
 *
 * Cuándo se muestra:
 *   - Usuario autenticado sin `account_type`, `first_name` o `phone`.
 *   - El componente padre (App / router) decide si renderizar esta página
 *     en lugar de la landing.
 *
 * Flow:
 *   1. Form con datos básicos + upload de foto + RIF.
 *   2. Submit → PUT /users/profile.
 *   3. Uploads van por endpoints separados (cada uno opcional).
 *   4. Al completar, refresca el contexto Auth (callback `onComplete`).
 */

import { ArrowRight, Building2, User as UserIcon } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import { UploadField } from '../components/UploadField';
import { useAuth } from '../contexts/AuthContext';
import {
  ApiError,
  usersApi,
  type AccountType,
  type User,
  type UserUpdatePayload,
} from '../services/api';

// ─── Form state ───────────────────────────────────────────────────────────

interface FormState {
  account_type: AccountType | '';
  first_name: string;
  last_name: string;
  phone: string;
  rif_cedula: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
}

function initialFromUser(user: User | null): FormState {
  return {
    account_type: user?.account_type ?? '',
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    phone: user?.phone ?? '',
    rif_cedula: user?.rif_cedula ?? '',
    address: user?.address ?? '',
    city: user?.city ?? '',
    state: user?.state ?? '',
    zip_code: user?.zip_code ?? '',
  };
}

interface OnboardingPageProps {
  onComplete: () => void;
}

// ─── Submit state ─────────────────────────────────────────────────────────

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

// ─── Componente ───────────────────────────────────────────────────────────

export function OnboardingPage({ onComplete }: OnboardingPageProps): JSX.Element {
  const { status: authStatus, user, refresh } = useAuth();
  const [form, setForm] = useState<FormState>(initialFromUser(user));
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  // Sincroniza si el user cambia (post-login).
  useEffect(() => {
    if (user) setForm(initialFromUser(user));
  }, [user]);

  const minRequirementsOk =
    form.account_type !== '' &&
    form.first_name.trim().length > 0 &&
    form.last_name.trim().length > 0 &&
    form.phone.trim().length >= 7;

  const canSubmit = minRequirementsOk && submit.kind !== 'saving';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmit({ kind: 'saving' });

    const payload: UserUpdatePayload = {
      account_type: form.account_type as AccountType,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
    };
    if (form.rif_cedula.trim()) payload.rif_cedula = form.rif_cedula.trim();
    if (form.address.trim()) payload.address = form.address.trim();
    if (form.city.trim()) payload.city = form.city.trim();
    if (form.state.trim()) payload.state = form.state.trim();
    if (form.zip_code.trim()) payload.zip_code = form.zip_code.trim();

    try {
      await usersApi.updateProfile(payload);
      await refresh();
      onComplete();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudo guardar el perfil';
      setSubmit({ kind: 'error', message });
    }
  }

  // ── Auth gate ──────────────────────────────────────────────────────────
  if (authStatus !== 'authenticated' || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tundra-bg text-white/40 text-sm">
        Inicia sesión para continuar.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tundra-bg text-white py-12 px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-10 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-tundra-gold mb-3">
            Bienvenido a Tundra
          </p>
          <h1 className="font-display text-4xl mb-3">
            Completa tu perfil
          </h1>
          <p className="text-white/50 text-sm">
            Necesitamos algunos datos para activar tu cuenta y procesar
            servicios. Solo te tomará un minuto.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-7">
          {/* Tipo de cuenta */}
          <fieldset>
            <legend className="text-[10px] uppercase tracking-wider text-white/50 mb-3">
              Tipo de cuenta <span className="text-tundra-danger">*</span>
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <AccountTypeOption
                value="particular"
                icon={UserIcon}
                title="Particular"
                hint="Para uso personal o residencial"
                selected={form.account_type === 'particular'}
                onSelect={() => setForm({ ...form, account_type: 'particular' })}
              />
              <AccountTypeOption
                value="empresa"
                icon={Building2}
                title="Empresa"
                hint="Para uso comercial o corporativo"
                selected={form.account_type === 'empresa'}
                onSelect={() => setForm({ ...form, account_type: 'empresa' })}
              />
            </div>
          </fieldset>

          {/* Nombre y apellido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Nombre"
              required
              value={form.first_name}
              onChange={(v) => setForm({ ...form, first_name: v })}
              maxLength={100}
            />
            <Field
              label="Apellido"
              required
              value={form.last_name}
              onChange={(v) => setForm({ ...form, last_name: v })}
              maxLength={100}
            />
          </div>

          {/* Teléfono y RIF */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Teléfono"
              required
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="+58 414-1234567"
              maxLength={20}
            />
            <Field
              label={form.account_type === 'empresa' ? 'RIF' : 'Cédula'}
              value={form.rif_cedula}
              onChange={(v) => setForm({ ...form, rif_cedula: v })}
              placeholder={
                form.account_type === 'empresa' ? 'J-12345678-9' : 'V-12345678'
              }
              maxLength={20}
            />
          </div>

          {/* Dirección */}
          <Field
            label="Dirección"
            value={form.address}
            onChange={(v) => setForm({ ...form, address: v })}
            placeholder="Calle, número, sector, edificio…"
            maxLength={500}
            multiline
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field
              label="Ciudad"
              value={form.city}
              onChange={(v) => setForm({ ...form, city: v })}
              maxLength={100}
            />
            <Field
              label="Estado"
              value={form.state}
              onChange={(v) => setForm({ ...form, state: v })}
              maxLength={100}
            />
            <Field
              label="Código postal"
              value={form.zip_code}
              onChange={(v) => setForm({ ...form, zip_code: v })}
              maxLength={20}
            />
          </div>

          {/* Uploads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UploadField
              label="Foto de perfil"
              hint="JPG, PNG o WEBP · máx 5 MB"
              accept="image/jpeg,image/png,image/webp"
              maxSizeMB={5}
              previewUrl={user.profile_photo_url}
              variant="image"
              onUpload={(file) => usersApi.uploadPhoto(file)}
              onComplete={() => void refresh()}
            />
            <UploadField
              label="Documento RIF / Cédula"
              hint="JPG, PNG o PDF · máx 8 MB"
              accept="image/jpeg,image/png,application/pdf"
              maxSizeMB={8}
              variant="document"
              onUpload={(file) => usersApi.uploadRif(file)}
              onComplete={() => void refresh()}
            />
          </div>

          {submit.kind === 'error' && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-tundra-danger/10 border border-tundra-danger/30 text-sm text-white/80"
            >
              {submit.message}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={[
              'inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg',
              'text-sm uppercase tracking-wider font-semibold transition-all duration-200',
              canSubmit
                ? 'bg-tundra-gold text-black hover:bg-tundra-goldBright hover:shadow-[0_0_30px_-5px_rgba(250,204,21,0.6)]'
                : 'bg-white/5 text-white/30 cursor-not-allowed',
            ].join(' ')}
          >
            {submit.kind === 'saving' ? 'Guardando…' : 'Continuar'}
            {submit.kind !== 'saving' && (
              <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

interface AccountTypeOptionProps {
  value: AccountType;
  icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}

function AccountTypeOption({
  icon: Icon,
  title,
  hint,
  selected,
  onSelect,
}: AccountTypeOptionProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex flex-col items-start gap-2 p-4 rounded-xl border transition-all',
        selected
          ? 'bg-tundra-gold/10 border-tundra-gold'
          : 'bg-tundra-surface border-white/5 hover:border-tundra-gold/30',
      ].join(' ')}
    >
      <Icon
        size={24}
        className={selected ? 'text-tundra-gold' : 'text-white/40'}
        aria-hidden
      />
      <p
        className={[
          'text-sm font-medium',
          selected ? 'text-tundra-gold' : 'text-white',
        ].join(' ')}
      >
        {title}
      </p>
      <p className="text-[11px] text-white/40">{hint}</p>
    </button>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  multiline?: boolean;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  multiline,
}: FieldProps): JSX.Element {
  const Comp = multiline ? 'textarea' : 'input';
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/50">
        {label}
        {required && <span className="text-tundra-danger"> *</span>}
      </span>
      <Comp
        type={multiline ? undefined : 'text'}
        value={value}
        onChange={(e) =>
          onChange((e.target as HTMLInputElement | HTMLTextAreaElement).value)
        }
        placeholder={placeholder}
        maxLength={maxLength}
        rows={multiline ? 3 : undefined}
        className={[
          'rounded-lg px-3 py-2.5 bg-tundra-surface border border-white/10',
          'text-sm text-white placeholder:text-white/20',
          'focus:outline-none focus:border-tundra-gold focus:ring-1 focus:ring-tundra-gold/30',
          'transition-colors',
          multiline && 'resize-none',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </label>
  );
}
