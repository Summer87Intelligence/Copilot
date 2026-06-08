"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";

import {
  CopilotBadge,
  CopilotCard,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import type { StrategicRecommendation } from "@/lib/copilot-strategic-recommendations-types";

const PRIORITY_LABEL: Record<StrategicRecommendation["priority"], string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
};

const CATEGORY_LABEL: Record<StrategicRecommendation["category"], string> = {
  cashflow: "Caja",
  collections: "Cobranza",
  operations: "Operaciones",
  risk: "Riesgo",
  opportunity: "Oportunidad",
};

function priorityTone(
  priority: StrategicRecommendation["priority"]
): "neutral" | "warning" | "danger" | "success" {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  return "neutral";
}

function StrategicRecommendationCard({
  recommendation,
}: {
  recommendation: StrategicRecommendation;
}) {
  return (
    <CopilotCard className="border-l-[3px] border-l-[var(--copilot-accent)] bg-[var(--copilot-card-bg)]/95 p-2 shadow-sm">
      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
          Decisión
        </span>
        <CopilotBadge tone={priorityTone(recommendation.priority)}>
          {PRIORITY_LABEL[recommendation.priority]}
        </CopilotBadge>
        <CopilotBadge tone="neutral">{CATEGORY_LABEL[recommendation.category]}</CopilotBadge>
        <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-[var(--copilot-ink)]">
          {recommendation.title}
        </p>
        {recommendation.cta?.href ? (
          <Link
            href={recommendation.cta.href}
            className="shrink-0 text-[10px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 transition hover:text-[var(--copilot-ink)] hover:underline"
          >
            {recommendation.cta.label}
          </Link>
        ) : null}
      </div>
      <dl className="mt-1 grid gap-x-2 gap-y-0.5 text-[11px] leading-snug sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Por qué
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{recommendation.rationale}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Impacto
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{recommendation.expectedImpact}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Desbloquea
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{recommendation.unlocks}</dd>
        </div>
      </dl>
    </CopilotCard>
  );
}

export function RutasStrategicRecommendationsSection() {
  const { recommendations, loading, error } = useRutasOperationalFeedSnapshot();
  const preview = useMemo(() => recommendations.slice(0, 3), [recommendations]);

  return (
    <section className="space-y-1">
      <CopilotSectionTitle
        title="Qué hacer ahora"
        subtitle="Decisión priorizada para hoy."
      />

      {error ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Preparando prioridad estratégica…
        </div>
      ) : (
        <ul className="space-y-1">
          {preview.map((recommendation) => (
            <li key={recommendation.id}>
              <StrategicRecommendationCard recommendation={recommendation} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
