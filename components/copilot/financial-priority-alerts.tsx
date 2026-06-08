"use client";

import type { FinancialPriorityAlert } from "@/lib/copilot-financial-priority-engine";

const SEVERITY_STYLE: Record<FinancialPriorityAlert["severity"], string> = {
  high: "border-rose-200 bg-rose-50/80 text-rose-950",
  medium: "border-amber-200 bg-amber-50/80 text-amber-950",
  low: "border-emerald-200 bg-emerald-50/80 text-emerald-950",
};

const SEVERITY_LABEL: Record<FinancialPriorityAlert["severity"], string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export function FinancialPriorityAlerts({ alerts }: { alerts: FinancialPriorityAlert[] }) {
  const visible = alerts.slice(0, 4);

  return (
    <section className="space-y-2" aria-label="Atención requerida hoy">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">
            Atención requerida hoy
          </h4>
          <p className="text-xs text-[var(--copilot-ink-muted)]">
            Señales determinísticas sobre concentración, aging y cobranza.
          </p>
        </div>
        <span className="rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 py-0.5 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
          {alerts.length} señal(es)
        </span>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {visible.map((alert) => (
          <article
            key={alert.id}
            className={`rounded-xl border px-3 py-2.5 ${SEVERITY_STYLE[alert.severity]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold">{alert.title}</p>
                <p className="mt-1 text-[11px] leading-snug opacity-85">{alert.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--copilot-card-bg)]/65 px-2 py-0.5 text-[10px] font-semibold">
                {SEVERITY_LABEL[alert.severity]}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
