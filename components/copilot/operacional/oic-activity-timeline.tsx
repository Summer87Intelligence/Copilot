"use client";

import { CopilotCard, CopilotSectionTitle, CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { OicRunEventRow } from "@/components/copilot/operacional/oic-run-event-row";
import { OicSkeletonRow } from "@/components/copilot/operacional/oic-skeleton-card";
import { OicEmptyState } from "@/components/copilot/operacional/oic-empty-state";
import { useOicActividad } from "@/hooks/use-oic-actividad";

export function OicActivityTimeline() {
  const { data, loading, error, refetch } = useOicActividad();

  return (
    <CopilotCard className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--copilot-border)]">
        <CopilotSectionTitle title="Actividad de Pipelines" subtitle="Últimas 48 horas" />
        <CopilotGhostButton onClick={refetch} className="text-xs shrink-0">
          Actualizar
        </CopilotGhostButton>
      </div>

      {loading && !data ? (
        <div className="divide-y divide-[var(--copilot-border)]">
          {[0, 1, 2, 3, 4].map((i) => <OicSkeletonRow key={i} />)}
        </div>
      ) : error ? (
        <div className="p-4">
          <p className="text-xs text-rose-700">{error}</p>
        </div>
      ) : !data || data.recentRuns.length === 0 ? (
        <div className="p-4">
          <OicEmptyState title="Sin actividad reciente" description="No hay ejecuciones de pipelines en las últimas 48h." />
        </div>
      ) : (
        <div className="divide-y divide-[var(--copilot-border)] max-h-[60vh] overflow-auto">
          {data.recentRuns.map((event) => (
            <OicRunEventRow key={event.runId} event={event} />
          ))}
        </div>
      )}
    </CopilotCard>
  );
}
