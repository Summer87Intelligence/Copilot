"use client";

import { useMemo } from "react";

import { useCopilotAlerts } from "@/components/copilot/copilot-alerts-context";
import type { CopilotSessionPreview } from "@/components/copilot/copilot-session-preview";
import { CopilotDevDatasetSummary } from "@/components/copilot/copilot-dev-dataset-summary";
import { CopilotDevTenantDiagnostics } from "@/components/copilot/copilot-dev-tenant-diagnostics";
import { CopilotUserBar } from "@/components/copilot/CopilotUserBar";
import { EnvironmentBannerLeft } from "@/components/copilot/environment-banner";
import { HealthIndicator } from "@/components/copilot/HealthIndicator";

/**
 * Primera fila del módulo: badge PROTOTIPO + copy (izq.); sesión + Salud (der.), misma franja.
 */
export function CopilotEnvironmentHealthStrip({
  sessionPreview = null,
}: {
  sessionPreview?: CopilotSessionPreview | null;
}) {
  const { items, loading } = useCopilotAlerts();
  const alerts = useMemo(
    () =>
      items.map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.priority,
      })),
    [items]
  );

  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[rgba(31,107,74,0.22)] bg-[var(--copilot-accent-soft)] px-4 py-2.5 text-sm text-[var(--copilot-ink)] sm:px-6 sm:py-3"
      >
        <div className="min-w-0 flex-1">
          <EnvironmentBannerLeft />
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:gap-x-4">
          <CopilotUserBar sessionPreview={sessionPreview} />
          <HealthIndicator alerts={alerts} loading={loading} />
        </div>
      </div>
      <CopilotDevTenantDiagnostics sessionPreview={sessionPreview ?? null} />
      <CopilotDevDatasetSummary />
    </>
  );
}
