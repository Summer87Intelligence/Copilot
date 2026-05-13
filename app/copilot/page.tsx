"use client";

import { CopilotHoyReturnLink } from "@/components/copilot/copilot-hoy-return-link";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { PipelineHealthPanel } from "@/components/copilot/pipeline-health-panel";
import {
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { usePipelineHealthRealtime } from "@/lib/copilot-pipeline-health-realtime";

const secondaryDestinations = [
  {
    href: "/copilot/finanzas",
    title: "Finanzas",
    description: "Liquidez, cobertura y agenda fiscal.",
  },
  {
    href: "/copilot/tesoreria",
    title: "Tesorería",
    description: "Caja manual, banco y obligaciones proyectadas.",
  },
  {
    href: "/copilot/datos",
    title: "Datos",
    description: "Base operativa y consistencia de registros.",
  },
] as const;

export default function CopilotHomePage() {
  const {
    summaries: pipelineHealth,
    loading: pipelineHealthLoading,
    error: pipelineHealthError,
    realtimeStatus: pipelineRealtimeStatus,
    lastUpdatedAt: pipelineLastUpdatedAt,
    isRefreshing: pipelineIsRefreshing,
  } = usePipelineHealthRealtime();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.home"
        title="Inicio"
        description="Accesos secundarios. El centro operativo del día está en Hoy."
        right={<CopilotHoyReturnLink />}
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <CopilotCard className="border-[rgba(31,107,74,0.16)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
          <p className="text-lg font-semibold text-[var(--copilot-ink)]">
            El centro operativo está en Hoy
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            Prioridad, alertas, recomendaciones y rutas guiadas viven en Hoy. Esta pantalla
            queda como acceso rápido a módulos profundos y al estado de pipelines.
          </p>
          <CopilotPrimaryLink href="/copilot/rutas" className="mt-6 inline-flex">
            Ir a Hoy
          </CopilotPrimaryLink>
        </CopilotCard>

        <section>
          <CopilotSectionTitle
            title="Accesos directos"
            subtitle="Módulos que no reemplazan el flujo operativo de Hoy."
          />
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {secondaryDestinations.map((item) => (
              <CopilotCard
                key={item.href}
                className="flex h-full flex-col border-[var(--copilot-border)] bg-white/90"
              >
                <p className="text-base font-semibold text-[var(--copilot-ink)]">{item.title}</p>
                <p className="mt-2 flex-1 text-sm text-[var(--copilot-ink-muted)]">
                  {item.description}
                </p>
                <CopilotGhostLink href={item.href} className="mt-4 font-semibold">
                  Abrir {item.title.toLowerCase()}
                </CopilotGhostLink>
              </CopilotCard>
            ))}
          </div>
        </section>

        <section>
          <CopilotSectionTitle
            title="Pipelines"
            subtitle="Salud de sincronización Zeta sin abrir el tablero ejecutivo anterior."
          />
          <div className="mt-4">
            <PipelineHealthPanel
              summaries={pipelineHealth}
              loading={pipelineHealthLoading}
              error={pipelineHealthError}
              realtimeStatus={pipelineRealtimeStatus}
              lastUpdatedAt={pipelineLastUpdatedAt}
              isRefreshing={pipelineIsRefreshing}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
