import { Suspense } from "react";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotGhostLink } from "@/components/copilot/copilot-ui";
import { OicHealthPanel } from "@/components/copilot/operacional/oic-health-panel";
import { OicQuickStats } from "@/components/copilot/operacional/oic-quick-stats";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";
import { CopilotOperationalStatusSection } from "@/components/copilot/copilot-operational-status-section";
import { DataConfidencePanel } from "@/components/copilot/operacional/data-confidence-panel";

export const dynamic = "force-dynamic";

export default function OperacionalPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Summer87 Copilot"
        title="Estado del sistema"
        description="Actualización de datos, reconciliación y salud de integraciones con Zeta."
      />
      <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <DataConfidencePanel />

        {/* Business status — same semaphore as the header indicator, expanded */}
        <CopilotOperationalStatusSection />

        <Suspense fallback={<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0,1,2,3].map(i=><OicSkeletonCard key={i} rows={2}/>)}</div>}>
          <OicQuickStats />
        </Suspense>
        <Suspense fallback={<OicSkeletonCard rows={7} />}>
          <OicHealthPanel />
        </Suspense>

        <CopilotCard className="border-[var(--copilot-border)] bg-white/90">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">Sincronizaciones</p>
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                Sincronización de datos en tiempo real
              </p>
            </div>
            <CopilotGhostLink href="/copilot/operacional/pipelines" className="shrink-0 text-xs font-semibold">
              Ver sincronizaciones →
            </CopilotGhostLink>
          </div>
        </CopilotCard>
      </div>
    </>
  );
}
