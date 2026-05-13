"use client";

import { Loader2 } from "lucide-react";

import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
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
          <CopilotGhostLink href="/copilot/gestion-ia" className="font-semibold">
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Insights activos
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.total}
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Deuda vencida
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.deudaVencida}
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Fiscal vencida
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.fiscalVencida}
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Alerta de caja
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
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
            <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--copilot-border)] py-10 text-sm text-[var(--copilot-ink-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Calculando recomendaciones…
            </div>
          ) : preview.length === 0 ? (
            <CopilotEmptyPanel
              title={COPILOT_EMPTY_COPY.gestionIa.title}
              paragraphs={[
                "No hay condiciones que disparen los cinco tipos de insight con los datos actuales.",
                "Cargá facturas con vencimiento y saldo, obligaciones fiscales o movimientos de caja para ver alertas aquí.",
              ]}
              example={COPILOT_EMPTY_COPY.gestionIa.example}
              importance="Los umbrales son conservadores: si no hay evidencia suficiente, no mostramos tarjetas."
            />
          ) : (
            <div className="mt-4 space-y-3">
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
              <CopilotGhostLink href="/copilot/gestion-ia" className="font-semibold">
                Abrir recomendaciones
              </CopilotGhostLink>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
