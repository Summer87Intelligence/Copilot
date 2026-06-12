"use client";

import type { FinancialRiskIndicator } from "@/lib/copilot-financial-priority-engine";

const STATUS_STYLE: Record<FinancialRiskIndicator["status"], string> = {
  healthy: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  warning: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  critical: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
};

const STATUS_LABEL: Record<FinancialRiskIndicator["status"], string> = {
  healthy: "Saludable",
  warning: "Atención",
  critical: "Crítico",
};

export function FinancialRiskSummary({ risks }: { risks: FinancialRiskIndicator[] }) {
  return (
    <section className="space-y-2" aria-label="Riesgo financiero">
      <div>
        <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">Riesgo financiero</h4>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Semáforos ejecutivos por cobranza, concentración, aging y clientes críticos.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {risks.map((risk) => (
          <article
            key={risk.id}
            className={`rounded-xl border px-3 py-2.5 ${STATUS_STYLE[risk.status]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold">{risk.label}</p>
              <span className="rounded-full bg-[var(--copilot-card-bg)]/70 px-2 py-0.5 text-[10px] font-semibold">
                {STATUS_LABEL[risk.status]}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug opacity-85">{risk.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
