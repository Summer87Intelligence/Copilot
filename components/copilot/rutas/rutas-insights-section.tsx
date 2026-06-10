"use client";

import { CopilotOperationalEmptyState } from "@/components/copilot/copilot-operational-empty-state";
import { CopilotSkeletonKpiRow } from "@/components/copilot/copilot-loading-skeleton";
import { CopilotRealInsightCard } from "@/components/copilot/copilot-real-insight-card";
import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import {
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { COPILOT_EMPTY_COPY } from "@/lib/copilot-empty-state";
import {
  countInsightsByKind,
  type CopilotRealInsight,
} from "@/lib/copilot-real-insights";
import { traceFromRealInsightsBatch } from "@/lib/copilot-trace-meta";

const PREVIEW_LIMIT = 3;

type RutasInsightsSectionProps = {
  loading: boolean;
  insights: CopilotRealInsight[];
  computedAt: string | null;
  recommendationsEnabled: boolean;
  loadError: string | null;
};

export function RutasInsightsSection({
  loading,
  insights,
  computedAt,
  recommendationsEnabled,
  loadError,
}: RutasInsightsSectionProps) {
  const kpi = countInsightsByKind(insights);
  const preview = insights.slice(0, PREVIEW_LIMIT);

  return (
    <section>
      <CopilotSectionTitle
        title="Acciones recomendadas"
        subtitle="Lecturas respaldadas por facturas, obligaciones fiscales y caja del prototipo."
        action={
          <CopilotGhostLink href="/copilot/agentes" className="font-semibold">
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
      {!recommendationsEnabled ? (
        <CopilotCard className="mt-4 border-amber-200/80 bg-amber-50/50">
          <p className="text-sm text-amber-950">
            Recomendaciones en pausa hasta validar cobertura y confianza de datos.
          </p>
        </CopilotCard>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CopilotCard className="flex flex-col gap-1 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Insights activos
              </p>
              <p className="text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.total}
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-1 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Deuda vencida
              </p>
              <p className="text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.deudaVencida}
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-1 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Fiscal vencida
              </p>
              <p className="text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.fiscalVencida}
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-1 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Alerta de caja
              </p>
              <p className="text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.desbalanceCaja}
              </p>
            </CopilotCard>
          </div>
          {!loading && preview.length > 0 ? (
            <div className="mt-4">
              <CopilotTraceMeta
                trace={traceFromRealInsightsBatch(computedAt)}
                variant="embed"
                dense
              />
            </div>
          ) : null}
          {loading ? (
            <CopilotSkeletonKpiRow count={4} className="mt-3" />
          ) : preview.length === 0 ? (
            <div className="mt-3">
              <CopilotOperationalEmptyState
                title="Motor de recomendaciones activo"
                status="Sin candidatos con evidencia suficiente"
                statusTone="healthy"
                metrics={[
                  { label: "Insights", value: kpi.total },
                  { label: "Deuda vencida", value: kpi.deudaVencida },
                  { label: "Fiscal vencida", value: kpi.fiscalVencida },
                  { label: "Caja", value: kpi.desbalanceCaja },
                ]}
                footnote={COPILOT_EMPTY_COPY.gestionIa.example}
              />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {preview.map((insight) => (
                <CopilotRealInsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          )}
          {!loading && preview.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <CopilotGhostLink href="/copilot/acciones" className="font-semibold">
                Seguimiento en Acciones
              </CopilotGhostLink>
              <CopilotGhostLink href="/copilot/agentes" className="font-semibold">
                Abrir recomendaciones
              </CopilotGhostLink>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
