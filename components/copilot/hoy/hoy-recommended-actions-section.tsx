"use client";

import { CopilotButtonLink } from "@/components/copilot/ui/copilot-button";
import type { RecommendedAction } from "@/lib/copilot-today-business-pulse";

const IMPACT_BY_ID: Record<string, string> = {
  review_overdue: "Recuperás cobros vencidos y bajás la deuda vencida.",
  review_risk_clients: "Evitás que clientes lentos pasen a mora crítica.",
  financial_detail: "Entendés deuda actual y antigüedad del negocio.",
  update_data: "Tomás decisiones con información más confiable.",
};

const CTA_BY_ID: Record<string, string> = {
  review_overdue: "Ir a Cartera",
  review_risk_clients: "Ver clientes",
  financial_detail: "Ver detalle",
  update_data: "Revisar datos",
};

function toneBorder(tone: RecommendedAction["tone"]): string {
  switch (tone) {
    case "critical":
      return "border-rose-200/80 bg-rose-50/40";
    case "warning":
      return "border-amber-200/80 bg-amber-50/35";
    default:
      return "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70";
  }
}

export function HoyRecommendedActionsSection({
  actions,
}: {
  actions: RecommendedAction[];
}) {
  const visible = actions.slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <section
      aria-label="Acciones recomendadas"
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-sm"
    >
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
          Acciones recomendadas
        </h2>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Hasta 3 pasos concretos según la situación actual del negocio.
        </p>
      </div>
      <ol className="space-y-2.5">
        {visible.map((action, index) => (
          <li
            key={action.id}
            className={`rounded-xl border px-3.5 py-3 ${toneBorder(action.tone)}`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
              {index + 1}. Acción recomendada
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--copilot-ink)]">
              {action.label}
            </p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
              Impacto esperado
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
              {IMPACT_BY_ID[action.id] ?? "Mejorás el control operativo del día."}
            </p>
            <CopilotButtonLink href={action.deepLink} size="sm" className="mt-3">
              {CTA_BY_ID[action.id] ?? "Ver detalle"}
            </CopilotButtonLink>
          </li>
        ))}
      </ol>
    </section>
  );
}
