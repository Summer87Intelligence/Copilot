"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";

const SEVERITY_LABEL: Record<OperationalNarrative["severity"], string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
};

const CATEGORY_LABEL: Record<OperationalNarrative["category"], string> = {
  cashflow: "Caja",
  collections: "Cobranza",
  treasury: "Tesorería",
  risk: "Riesgo",
  operations: "Operaciones",
};

function severityTone(
  severity: OperationalNarrative["severity"]
): "neutral" | "warning" | "danger" | "success" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  return "neutral";
}

function NarrativeCard({ narrative }: { narrative: OperationalNarrative }) {
  return (
    <CopilotCard className="border border-[rgba(31,107,74,0.12)] bg-[var(--copilot-table-header-bg)] p-2 shadow-none">
      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Lectura
        </span>
        <CopilotBadge tone={severityTone(narrative.severity)}>
          {SEVERITY_LABEL[narrative.severity]}
        </CopilotBadge>
        <CopilotBadge tone="neutral">{CATEGORY_LABEL[narrative.category]}</CopilotBadge>
        <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-[var(--copilot-ink)]">
          {narrative.title}
        </p>
        {narrative.cta?.href ? (
          <Link
            href={narrative.cta.href}
            className="shrink-0 text-[10px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 transition hover:text-[var(--copilot-ink)] hover:underline"
          >
            {narrative.cta.label}
          </Link>
        ) : null}
      </div>
      <dl className="mt-1 grid gap-x-2 gap-y-0.5 text-[11px] leading-snug sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink)]">
            Causa
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{narrative.cause}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink)]">
            Impacto
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{narrative.impact}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink)]">
            Acción
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{narrative.recommendation}</dd>
        </div>
      </dl>
    </CopilotCard>
  );
}

export function RutasOperationalNarrativesSection() {
  const { narratives, loading, error } = useRutasOperationalFeedSnapshot();

  if (!loading && narratives.length === 0 && !error) {
    return null;
  }

  return (
    <section className="space-y-1">
      <CopilotSectionTitle
        title="Impacto del problema"
        subtitle="Causa, impacto y acción inmediata."
        action={
          <CopilotGhostLink
            href="/copilot/tesoreria"
            className="border-transparent bg-transparent px-0 py-0 text-[11px] font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
          >
            Ver caja
          </CopilotGhostLink>
        }
      />

      {error ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Preparando lectura ejecutiva…
        </div>
      ) : (
        <ul className="space-y-1">
          {narratives.map((narrative) => (
            <li key={narrative.id}>
              <NarrativeCard narrative={narrative} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
