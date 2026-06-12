"use client";

import { ChevronRight } from "lucide-react";

import { CopilotButtonLink } from "@/components/copilot/ui/copilot-button";
import { copilotCardCompactClass } from "@/components/copilot/ui/copilot-visual-system";
import type { RecommendedAction } from "@/lib/copilot-today-business-pulse";

const IMPACT_BY_ID: Record<string, string> = {
  review_overdue: "Recuperás cobros atrasados y bajás el atrasado total.",
  review_risk_clients: "Evitás que clientes lentos pasen a mora crítica.",
  financial_detail: "Entendés total pendiente y antigüedad del negocio.",
  update_data: "Tomás decisiones con información más confiable.",
};

const CTA_BY_ID: Record<string, string> = {
  review_overdue: "Ir a Cartera",
  review_risk_clients: "Ver clientes",
  financial_detail: "Ver detalle",
  update_data: "Revisar datos",
};

function toneAccent(tone: RecommendedAction["tone"]): string {
  switch (tone) {
    case "critical":
      return "border-l-[var(--copilot-badge-danger-text)] bg-[var(--copilot-tone-danger-bg)]";
    case "warning":
      return "border-l-[var(--copilot-badge-warning-text)] bg-[var(--copilot-tone-warning-bg)]";
    default:
      return "border-l-[var(--copilot-accent)] bg-[var(--copilot-soft-bg)]";
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
    <section aria-label="Acciones recomendadas" className={copilotCardCompactClass}>
      <div className="mb-2.5">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Qué hacer hoy</h2>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Hasta 3 pasos concretos según la situación actual.
        </p>
      </div>
      <ol className="divide-y divide-[var(--copilot-border)] rounded-lg border border-[var(--copilot-border)]">
        {visible.map((action, index) => (
          <li
            key={action.id}
            className={`flex flex-wrap items-center gap-2 border-l-[3px] px-3 py-2.5 sm:flex-nowrap ${toneAccent(action.tone)}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-card-bg)] text-[11px] font-bold text-[var(--copilot-ink-muted)]">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">{action.label}</p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                {IMPACT_BY_ID[action.id] ?? "Mejorás el control operativo del día."}
              </p>
            </div>
            <CopilotButtonLink
              href={action.deepLink}
              size="sm"
              variant="ghost"
              className="shrink-0 !px-2"
            >
              {CTA_BY_ID[action.id] ?? "Ver detalle"}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </CopilotButtonLink>
          </li>
        ))}
      </ol>
    </section>
  );
}
