"use client";

import { CopilotCard, CopilotSectionTitle, CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { OicScoreRing } from "@/components/copilot/operacional/oic-score-ring";
import { OicSeverityBadge } from "@/components/copilot/operacional/oic-severity-badge";
import { OicDimensionRow } from "@/components/copilot/operacional/oic-dimension-row";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";
import { useOicHealth } from "@/hooks/use-oic-health";

function ago(isoDate: string | null): string {
  if (!isoDate) return "—";
  const diff = Date.now() - new Date(isoDate).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function OicHealthPanel() {
  const { data, loading, error, lastFetchedAt, refetch } = useOicHealth();

  if (loading && !data) {
    return <OicSkeletonCard rows={6} />;
  }

  if (error || !data) {
    return (
      <CopilotCard>
        <p className="text-xs text-rose-700">{error ?? "No se pudo cargar el panel de salud."}</p>
      </CopilotCard>
    );
  }

  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Salud del Sistema"
        subtitle={`Actualizado ${ago(lastFetchedAt)}`}
        action={
          <CopilotGhostButton onClick={refetch} className="text-xs">
            Actualizar
          </CopilotGhostButton>
        }
      />

      <div className="flex items-center gap-5 pb-4">
        <OicScoreRing score={data.overallScore} severity={data.severity} size={88} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[var(--copilot-ink)]">{data.overallScore}</span>
            <OicSeverityBadge severity={data.severity} />
          </div>
          <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
            {data.openViolations} violaciones abiertas · {data.pendingResyncJobs} jobs pendientes
          </p>
          <p className="text-xs text-[var(--copilot-ink-muted)]">
            Último sync: {ago(data.lastSyncAt)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-[var(--copilot-border)]">
        {data.dimensions.map((dim) => (
          <OicDimensionRow key={dim.key} dim={dim} />
        ))}
      </div>
    </CopilotCard>
  );
}
