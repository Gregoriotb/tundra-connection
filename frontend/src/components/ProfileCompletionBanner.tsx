/**
 * ProfileCompletionBanner — recordatorio sutil de perfil incompleto.
 *
 * Spec:
 *   - Orquestor.md §FASE 7
 *   - R2 No `any`
 *
 * Cuándo se muestra:
 *   - Usuario autenticado con campos faltantes que NO bloquean uso pero
 *     son necesarios para emitir facturas / resolver tickets:
 *       · Sin RIF/cédula
 *       · Sin dirección completa
 *       · Sin foto (opcional, no genera banner solo)
 *
 *   - Si falta `account_type` o nombre, el flow correcto es la
 *     OnboardingPage completa, no este banner.
 *
 * Comportamiento:
 *   - Dismissible por sesión (sessionStorage).
 *   - Click "Completar" → callback `onComplete` (la app abre OnboardingPage
 *     o un modal con sólo los campos faltantes).
 */

import { Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';

interface ProfileCompletionBannerProps {
  onComplete: () => void;
}

const DISMISS_KEY = 'tundra.profile_banner_dismissed';

// ─── Helpers ──────────────────────────────────────────────────────────────

interface MissingFields {
  rif: boolean;
  address: boolean;
  count: number;
}

function evaluateMissing(
  user: ReturnType<typeof useAuth>['user'],
): MissingFields | null {
  if (!user) return null;
  // Si el onboarding básico aún no se completó, no mostramos este banner
  // (la app debería estar enseñando OnboardingPage en su lugar).
  if (!user.has_completed_onboarding) return null;

  const rif = !user.rif_cedula || user.rif_cedula.trim() === '';
  const address =
    !user.address ||
    !user.city ||
    !user.state ||
    user.address.trim() === '' ||
    user.city.trim() === '' ||
    user.state.trim() === '';

  const count = (rif ? 1 : 0) + (address ? 1 : 0);
  if (count === 0) return null;
  return { rif, address, count };
}

function buildMessage(missing: MissingFields): string {
  const parts: string[] = [];
  if (missing.rif) parts.push('RIF/Cédula');
  if (missing.address) parts.push('dirección completa');
  return parts.join(' y ');
}

// ─── Componente ───────────────────────────────────────────────────────────

export function ProfileCompletionBanner({
  onComplete,
}: ProfileCompletionBannerProps): JSX.Element | null {
  const { user, status: authStatus } = useAuth();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const missing = useMemo(() => evaluateMissing(user), [user]);

  // Si el user resuelve los campos, limpiamos la marca de dismissed
  // para que un próximo evento de "vuelve a faltar algo" muestre banner.
  useEffect(() => {
    if (missing === null) {
      try {
        sessionStorage.removeItem(DISMISS_KEY);
      } catch {
        // ignore
      }
    }
  }, [missing]);

  if (authStatus !== 'authenticated' || missing === null || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex items-center gap-3 px-4 py-3 mx-4 lg:mx-12 mt-4 rounded-xl',
        'bg-tundra-gold/8 border border-tundra-gold/30 text-white/85',
        'backdrop-blur-sm',
      ].join(' ')}
      style={{ backgroundColor: 'rgba(197,160,89,0.08)' }}
    >
      <div className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-tundra-gold/15 text-tundra-gold flex-shrink-0">
        <Sparkles size={16} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium text-tundra-gold">
            Tu perfil está casi listo.
          </span>{' '}
          <span className="text-white/70">
            Falta {buildMessage(missing)} para emitir facturas y agilizar el
            soporte.
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onComplete}
        className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-tundra-gold text-black text-xs uppercase tracking-wider font-semibold hover:bg-tundra-goldBright transition-colors"
      >
        Completar
      </button>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, '1');
          } catch {
            // ignore
          }
        }}
        aria-label="Recordarme luego"
        className="flex-shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
