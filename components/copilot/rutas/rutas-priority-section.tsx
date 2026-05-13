"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { useCopilotAlerts } from "@/components/copilot/copilot-alerts-context";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { pickPrimaryAttentionCta } from "@/lib/copilot-attention-priority-cta";
import {
  buildAttentionCaseContent,
  pickPrimaryUrgentCase,
} from "@/lib/copilot-attention-case";
import {
  getFinancialSnapshot,
  type FinancialSnapshotApiV1,
} from "@/lib/copilot-financial-engine";
import { mapAlertCategory } from "@/lib/copilot-format";

const priorityLabel = {
  critical: "Crítica",
  high: "Alta",
} as const;

export function RutasPrioritySection() {
  const { items: allAlerts, loading: alertsLoading } = useCopilotAlerts();
  const [snapshot, setSnapshot] = useState<FinancialSnapshotApiV1 | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  const primary = useMemo(() => pickPrimaryUrgentCase(allAlerts), [allAlerts]);
  const content = useMemo(
    () => (primary ? buildAttentionCaseContent(primary) : null),
    [primary]
  );

  useEffect(() => {
    let cancelled = false;
    void getFinancialSnapshot()
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const primaryCta = useMemo(() => {
    if (!primary) return null;
    return pickPrimaryAttentionCta(primary, snapshot);
  }, [primary, snapshot]);

  const loading = alertsLoading || snapshotLoading;

  return (
    <section>
      <CopilotSectionTitle
        title="Atención prioritaria"
        subtitle="Un solo foco crítico o alto para abrir el día."
        action={
          <CopilotGhostLink href="/copilot/atencion-prioritaria" className="font-semibold">
            Ver caso completo
          </CopilotGhostLink>
        }
      />
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Cargando caso prioritario…
        </div>
      ) : !primary || !content || !primaryCta ? (
        <CopilotCard className="mt-4 border-emerald-200/70 bg-emerald-50/35">
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">
            Sin situaciones críticas ni altas pendientes
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            El semáforo no marca foco urgente. Revisá alertas o mantené la base en Datos.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <CopilotGhostLink href="/copilot/alertas" className="font-semibold">
              Ver alertas
            </CopilotGhostLink>
            <CopilotGhostLink href="/copilot/finanzas" className="font-semibold">
              Abrir Finanzas
            </CopilotGhostLink>
          </div>
        </CopilotCard>
      ) : (
        <CopilotCard
          className={`mt-4 ${
            primary.priority === "critical"
              ? "border-rose-300/90 bg-gradient-to-br from-rose-50/90 via-white to-white shadow-md ring-1 ring-rose-200/60"
              : "border-amber-200/90 bg-gradient-to-br from-amber-50/80 via-white to-white shadow-md ring-1 ring-amber-200/50"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <CopilotBadge tone={primary.priority === "critical" ? "danger" : "warning"}>
                {primary.priority === "critical" ? priorityLabel.critical : priorityLabel.high}
              </CopilotBadge>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                {mapAlertCategory(primary.type)}
              </p>
              <h3 className="text-lg font-semibold tracking-tight text-[var(--copilot-ink)]">
                {primary.title}
              </h3>
              <p className="max-w-3xl text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                {primary.summary}
              </p>
              <p className="text-sm text-[var(--copilot-ink)]">
                <span className="font-semibold">Primer paso: </span>
                {content.planSteps[0] ?? "Definir responsable y fecha límite hoy."}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CopilotPrimaryLink href={primaryCta.href}>{primaryCta.label}</CopilotPrimaryLink>
            <Link
              href="/copilot/atencion-prioritaria"
              className="text-sm font-medium text-[var(--copilot-ink-muted)] underline decoration-[var(--copilot-border)] underline-offset-4 transition hover:text-[var(--copilot-ink)]"
            >
              Plan detallado
            </Link>
          </div>
        </CopilotCard>
      )}
    </section>
  );
}
