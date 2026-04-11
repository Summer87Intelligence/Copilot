"use client";

import { useMemo } from "react";

import { useCopilotAlerts } from "@/components/copilot/copilot-alerts-context";
import { EnvironmentBannerLeft } from "@/components/copilot/environment-banner";
import { HealthIndicator } from "@/components/copilot/HealthIndicator";

/**
 * Primera fila del módulo: badge PROTOTIPO + copy de entorno (izq.) y semáforo Salud (der.).
 */
export function CopilotEnvironmentHealthStrip() {
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
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[rgba(31,107,74,0.22)] bg-[var(--copilot-accent-soft)] px-4 py-2.5 text-sm text-[var(--copilot-ink)] sm:px-6 sm:py-3"
    >
      <div className="min-w-0 flex-1">
        <EnvironmentBannerLeft />
      </div>
      <div className="flex shrink-0 items-center justify-end">
        <HealthIndicator alerts={alerts} loading={loading} />
      </div>
    </div>
  );
}
