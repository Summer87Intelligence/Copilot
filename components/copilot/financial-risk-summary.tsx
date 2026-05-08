"use client";

import type { FinancialRiskIndicator } from "@/lib/copilot-financial-priority-engine";

const STATUS_STYLE: Record<FinancialRiskIndicator["status"], string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-rose-200 bg-rose-50 text-rose-900",
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
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold">
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
