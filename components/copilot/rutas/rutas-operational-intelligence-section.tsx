"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { CopilotCard, CopilotBadge, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import type {
  OperationalIntelligenceInsight,
  OperationalIntelligenceResponse,
} from "@/lib/copilot-operational-intelligence-types";

function severityTone(
  s: OperationalIntelligenceInsight["severity"]
): "neutral" | "warning" | "danger" | "success" {
  if (s === "critical") return "danger";
  if (s === "high") return "warning";
  if (s === "low") return "success";
  return "neutral";
}

function severityLabel(s: OperationalIntelligenceInsight["severity"]): string {
  if (s === "critical") return "Crítico";
  if (s === "high") return "Alto";
  if (s === "medium") return "Medio";
  return "Bajo";
}

function categoryLabel(c: OperationalIntelligenceInsight["category"]): string {
  const map: Record<OperationalIntelligenceInsight["category"], string> = {
    cashflow: "Caja",
    collections: "Cobranza",
    operations: "Operaciones",
    governance: "Governance",
    execution: "Ejecución",
    risk: "Riesgo",
  };
  return map[c];
}

function ConfidencePip({ confidence }: { confidence: OperationalIntelligenceInsight["confidence"] }) {
  const color =
    confidence === "high" ? "bg-emerald-500" : confidence === "medium" ? "bg-amber-400" : "bg-rose-400";
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} aria-hidden title={`Confianza ${confidence}`} />
  );
}

function PrimaryInsightCard({ insight }: { insight: OperationalIntelligenceInsight }) {
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <CopilotCard className="border-l-[3px] border-l-[var(--copilot-accent)] bg-white/95 p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <CopilotBadge tone={severityTone(insight.severity)}>
          {severityLabel(insight.severity)}
        </CopilotBadge>
        <CopilotBadge tone="neutral">{categoryLabel(insight.category)}</CopilotBadge>
        <span className="flex items-center gap-1 text-[10px] text-[var(--copilot-ink-muted)]">
          <ConfidencePip confidence={insight.confidence} />
          Confianza {insight.confidence === "high" ? "alta" : insight.confidence === "medium" ? "media" : "baja"}
        </span>
      </div>

      <p className="mt-1.5 text-[13px] font-semibold leading-snug text-[var(--copilot-ink)]">
        {insight.title}
      </p>

      <dl className="mt-2 space-y-1.5 text-[11px]">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Causa
          </dt>
          <dd className="mt-0.5 text-[var(--copilot-ink-muted)]">{insight.cause}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Impacto
          </dt>
          <dd className="mt-0.5 text-[var(--copilot-ink-muted)]">{insight.impact}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
            Acción siguiente
          </dt>
          <dd className="mt-0.5 font-medium text-[var(--copilot-ink)]">{insight.nextBestAction}</dd>
        </div>
        {(insight.severity === "critical" || insight.severity === "high") ? (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">
              Si se ignora
            </dt>
            <dd className="mt-0.5 text-rose-700">{insight.consequenceIfIgnored}</dd>
          </div>
        ) : null}
      </dl>

      {insight.evidence.length > 0 ? (
        <div className="mt-2 border-t border-[var(--copilot-border)]/40 pt-1.5">
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-medium text-[var(--copilot-ink-muted)] transition hover:text-[var(--copilot-ink)]"
          >
            {showEvidence ? (
              <ChevronUp className="h-3 w-3" aria-hidden />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden />
            )}
            Evidencia ({insight.evidence.length})
          </button>
          {showEvidence ? (
            <ul className="mt-1 space-y-0.5">
              {insight.evidence.map((ev) => (
                <li key={ev} className="text-[10px] text-[var(--copilot-ink-muted)]">
                  · {ev}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </CopilotCard>
  );
}

function SecondaryInsightRow({ insight }: { insight: OperationalIntelligenceInsight }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--copilot-border)]/50 bg-white/70 px-2.5 py-2">
      <CopilotBadge tone={severityTone(insight.severity)}>
        {severityLabel(insight.severity)}
      </CopilotBadge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-[var(--copilot-ink)]">
          {insight.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10px] text-[var(--copilot-ink-muted)]">
          {insight.impact}
        </p>
      </div>
      <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {categoryLabel(insight.category)}
      </span>
    </div>
  );
}

function PatternBanner({
  pattern,
}: {
  pattern: NonNullable<OperationalIntelligenceResponse["topPattern"]>;
}) {
  return (
    <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        Patrón detectado
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-amber-900">{pattern.title}</p>
      <p className="mt-0.5 text-[10px] text-amber-800">{pattern.description}</p>
      {pattern.evidence.length > 0 ? (
        <p className="mt-1 text-[10px] text-amber-700">{pattern.evidence.join(" · ")}</p>
      ) : null}
    </div>
  );
}

export function RutasOperationalIntelligenceSection() {
  const { operationalIntelligence: intelligence, loading } = useRutasOperationalFeedSnapshot();

  if (loading && !intelligence) {
    return (
      <section className="space-y-1">
        <CopilotSectionTitle
          title="Inteligencia operacional"
          subtitle="Análisis causal del estado operativo."
        />
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--copilot-border)]/20" />
      </section>
    );
  }

  if (!intelligence || intelligence.insights.length === 0) {
    return (
      <section className="space-y-1">
        <CopilotSectionTitle
          title="Inteligencia operacional"
          subtitle="Análisis causal del estado operativo."
        />
        <p className="text-[11px] text-[var(--copilot-ink-muted)]">
          Sin señales operacionales relevantes en este momento.
        </p>
      </section>
    );
  }

  const [primary, ...rest] = intelligence.insights;
  const secondaries = rest.slice(0, 2);

  return (
    <section className="space-y-1">
      <CopilotSectionTitle
        title="Inteligencia operacional"
        subtitle="Análisis causal del estado operativo."
      />

      <div className="space-y-2">
        {intelligence.topPattern ? (
          <PatternBanner pattern={intelligence.topPattern} />
        ) : null}

        {primary ? <PrimaryInsightCard insight={primary} /> : null}

        {secondaries.length > 0 ? (
          <div className="space-y-1.5">
            {secondaries.map((insight) => (
              <SecondaryInsightRow key={insight.id} insight={insight} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
