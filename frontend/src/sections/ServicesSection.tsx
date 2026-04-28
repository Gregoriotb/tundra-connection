/**
 * ServicesSection — sección landing con los 3 servicios (Orquestor §FASE 3).
 *
 * Orquesta:
 *   - Fetch a /services
 *   - Grid de ServiceCard
 *   - Apertura de ServiceOverlay
 *   - Apertura de InternetPlanModal cuando se selecciona un plan
 *   - CTA chat-cotización para servicios_extras (queda pendiente FASE 4)
 */

import { AlertTriangle, PackageOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { InternetPlanModal } from '../components/InternetPlanModal';
import { ServiceCard, type InternetPlan, type Service } from '../components/ServiceCard';
import { ServiceOverlay } from '../components/ServiceOverlay';
import { ApiError, servicesApi } from '../services/api';

interface ServicesSectionProps {
  onLoginRequest: () => void;
}

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: Service[] };

export function ServicesSection({ onLoginRequest }: ServicesSectionProps): JSX.Element {
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [openService, setOpenService] = useState<Service | null>(null);
  const [selected, setSelected] = useState<{ service: Service; plan: InternetPlan } | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await servicesApi.list();
      setState({ status: 'ready', items: res.items });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : 'No se pudieron cargar los servicios';
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelectPlan = useCallback(
    (service: Service, plan: InternetPlan) => {
      setOpenService(null);          // cierra overlay
      setSelected({ service, plan });
    },
    [],
  );

  const handleStartQuote = useCallback((_service: Service) => {
    setOpenService(null);
    // FASE 4: aquí se abrirá el ChatThread / pantalla de cotización.
    // eslint-disable-next-line no-console
    console.info('[FASE 4 pendiente] Iniciar cotización para servicios extras.');
  }, []);

  return (
    <section
      id="servicios"
      className="relative py-20 lg:py-28 px-6 lg:px-12 bg-tundra-bg text-white"
    >
      <div className="max-w-7xl mx-auto">
        <header className="mb-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-tundra-gold mb-3">
            Servicios
          </p>
          <h2 className="font-display text-4xl lg:text-5xl mb-4">
            Conexión sin compromisos
          </h2>
          <p className="text-white/50 max-w-2xl mx-auto text-base lg:text-lg">
            Tres soluciones diseñadas para llevar conectividad confiable a hogares,
            empresas y proyectos donde la tecnología es crítica.
          </p>
        </header>

        {state.status === 'loading' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden
                className="aspect-[3/4] rounded-3xl bg-tundra-surface border border-tundra-border animate-pulse"
              />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <AlertTriangle size={48} className="text-tundra-danger" aria-hidden />
            <p className="text-white/70">{state.message}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="px-5 py-2 rounded-lg border border-tundra-gold text-tundra-gold hover:bg-tundra-gold hover:text-black transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {state.status === 'ready' && state.items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-white/40">
            <PackageOpen size={48} aria-hidden />
            <p>Servicios próximamente.</p>
          </div>
        )}

        {state.status === 'ready' && state.items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {state.items.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onOpen={setOpenService}
              />
            ))}
          </div>
        )}
      </div>

      <ServiceOverlay
        service={openService}
        onClose={() => setOpenService(null)}
        onSelectPlan={handleSelectPlan}
        onStartQuote={handleStartQuote}
      />

      <InternetPlanModal
        service={selected?.service ?? null}
        plan={selected?.plan ?? null}
        onClose={() => setSelected(null)}
        onLoginRequest={() => {
          setSelected(null);
          onLoginRequest();
        }}
        onSuccess={(_invoiceId) => {
          // Toast + future redirect to /my-invoices se manejará en FASE 8.
        }}
      />
    </section>
  );
}
