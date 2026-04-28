/**
 * GrafanaEmbed — wrapper de iframe para dashboards de Grafana (FASE 9).
 *
 * Spec:
 * - Orquestor.md §FASE 9
 * - Grafana en Tundra es SELF-HOSTED (no Grafana Cloud).
 *
 * Decisiones:
 * - `sandbox` permite scripts y same-origin (Grafana lo necesita) pero
 *   bloquea formularios, popups y top-navigation — minimiza la sup. de
 *   ataque si alguien registra un URL malicioso.
 * - `referrerPolicy="no-referrer"` para no filtrar info del admin panel.
 * - `loading="lazy"` ahorra recursos cuando hay varios dashboards en la
 *   misma vista.
 * - El componente NO conoce el cliente HTTP — recibe `urlEmbed` como
 *   prop. En FASE 11 (sweep) se cambia a `proxyUrl` que apunta a
 *   `/admin/grafana/{id}/proxy`, con la misma interfaz.
 */

import { useState } from 'react';
import { AlertCircle, ExternalLink, Maximize2 } from 'lucide-react';

interface GrafanaEmbedProps {
  /** URL completa de Grafana (`/d-solo/<uid>?...` o `/d/<uid>?...`). */
  urlEmbed: string;
  /** Nombre visible para accesibilidad y header del frame. */
  name: string;
  /** Alto del iframe en píxeles. Default 480. */
  height?: number;
  /** Permite abrir el dashboard en pestaña nueva. */
  showOpenLink?: boolean;
}

export function GrafanaEmbed({
  urlEmbed,
  name,
  height = 480,
  showOpenLink = true,
}: GrafanaEmbedProps): JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div className="rounded-lg border border-tundra-border bg-black/40 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-tundra-border bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Maximize2 className="w-3.5 h-3.5 text-tundra-gold" />
          <span className="text-xs uppercase tracking-wider text-white/70">
            {name}
          </span>
        </div>
        {showOpenLink && (
          <a
            href={urlEmbed}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40 hover:text-tundra-gold"
          >
            Abrir <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </header>

      <div className="relative" style={{ height }}>
        {!loaded && !errored && (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs uppercase tracking-wider">
            Cargando dashboard…
          </div>
        )}

        {errored && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
            <AlertCircle className="w-6 h-6 text-red-300" />
            <span className="text-sm text-red-300">
              No se pudo cargar el dashboard.
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/40 max-w-md">
              Verifica que la instancia self-hosted permita embed desde este
              dominio (X-Frame-Options / CSP / cookie SameSite).
            </span>
          </div>
        )}

        <iframe
          key={urlEmbed}
          src={urlEmbed}
          title={`Grafana · ${name}`}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={[
            'w-full h-full border-0 transition-opacity',
            loaded && !errored ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
      </div>
    </div>
  );
}
