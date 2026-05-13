"use client";

import { Loader2 } from "lucide-react";

import { useCopilotAlerts } from "@/components/copilot/copilot-alerts-context";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";
import {
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { mapAlertCategory } from "@/lib/copilot-format";

const PREVIEW_LIMIT = 4;

export function RutasAlertsPreviewSection() {
  const { items, loading, fiscalError, predictiveError } = useCopilotAlerts();
  const preview = items.slice(0, PREVIEW_LIMIT);
  const loadError = fiscalError ?? predictiveError;

  return (
    <section>
      <CopilotSectionTitle
        title="Alertas accionables"
        subtitle="Misma fuente que el listado global de alertas."
        action={
          <CopilotGhostLink href="/copilot/alertas" className="font-semibold">
            Ver todas
          </CopilotGhostLink>
        }
      />
      {loadError ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {loadError}
        </div>
      ) : null}
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Cargando alertas…
        </div>
      ) : preview.length === 0 ? (
        <CopilotCard className="mt-4 border-emerald-200/70 bg-emerald-50/35">
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            No hay alertas activas en este momento.
          </p>
        </CopilotCard>
      ) : (
        <ul className="mt-4 space-y-3">
          {preview.map((alert) => (
            <li key={alert.id}>
              <CopilotCard className="border-[var(--copilot-border)] bg-white/90 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      {mapAlertCategory(alert.type)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--copilot-ink)]">
                      {alert.title}
                    </p>
                    <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                      {alert.summary}
                    </p>
                  </div>
                  <CopilotSeverityBadge severity={alert.priority} />
                </div>
              </CopilotCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
