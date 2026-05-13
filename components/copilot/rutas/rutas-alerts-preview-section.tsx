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
import { buildCopilotAlertOpsContext } from "@/lib/copilot-alert-ops-mapper";

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
        <CopilotCard className="mt-2 border-dashed border-[var(--copilot-border)] bg-white/70 px-3 py-3">
          <p className="text-sm font-medium text-[var(--copilot-ink)]">Sin alertas activas</p>
          <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
            Revisá Hoy o Finanzas si esperabas tensión de caja.
          </p>
          <CopilotGhostLink href="/copilot/alertas" className="mt-3 inline-flex font-semibold">
            Abrir alertas
          </CopilotGhostLink>
        </CopilotCard>
      ) : (
        <ul className="mt-2 space-y-2">
          {preview.map((alert) => {
            const ops = buildCopilotAlertOpsContext(alert);
            return (
            <li key={alert.id}>
              <CopilotCard className="border-[var(--copilot-border)] bg-white/90 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      {mapAlertCategory(alert.type)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--copilot-ink)]">
                      {alert.title}
                    </p>
                    <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                      {ops.impact}
                    </p>
                  </div>
                  <CopilotSeverityBadge severity={alert.priority} />
                </div>
                <CopilotGhostLink
                  href={ops.primary.href}
                  className="mt-3 inline-flex text-xs font-semibold"
                >
                  {ops.primary.label}
                </CopilotGhostLink>
              </CopilotCard>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
