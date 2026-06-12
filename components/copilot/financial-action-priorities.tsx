"use client";

import type { FinancialActionPriority } from "@/lib/copilot-financial-priority-engine";

const CURRENCY_SYMBOL: Record<string, string> = {
  UYU: "$",
  USD: "U$S",
};

const PRIORITY_STYLE: Record<FinancialActionPriority["risk"], string> = {
  high: "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  medium: "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  low: "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
};

const RISK_LABEL: Record<FinancialActionPriority["risk"], string> = {
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

export function FinancialActionPriorities({
  priorities,
}: {
  priorities: FinancialActionPriority[];
}) {
  const rows = priorities.slice(0, 8);

  return (
    <section className="space-y-2" aria-label="Prioridades de acción">
      <div>
        <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">
          Prioridades de acción
        </h4>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Ordenadas por monto, aging dominante y concentración de deuda.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2.5 text-sm text-[var(--copilot-ink-muted)]">
          No hay clientes con saldo pendiente para priorizar hoy.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/90">
          <table className="w-full text-left text-xs">
            <thead className="bg-[rgba(44,40,37,0.035)] text-[var(--copilot-ink-muted)]">
              <tr>
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 text-right font-semibold">Pendiente</th>
                <th className="px-3 py-2 text-right font-semibold">Aging</th>
                <th className="px-3 py-2 text-right font-semibold">Riesgo</th>
                <th className="px-3 py-2 text-right font-semibold">Prioridad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--copilot-border)]">
                  <td className="max-w-[260px] truncate px-3 py-2 font-medium text-[var(--copilot-ink)]">
                    {row.companyName}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--copilot-ink)]">
                    {money(row.currencyCode, row.pendingAmount)}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--copilot-ink-muted)]">
                    {row.oldestAgeDays}d · {row.dominantAgingLabel}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLE[row.risk]}`}
                    >
                      {RISK_LABEL[row.risk]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {row.priorityScore}
                    </span>
                    <span className="ml-1 text-[11px] text-[var(--copilot-ink-muted)]">
                      {row.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function money(currencyCode: string, value: number): string {
  const symbol = CURRENCY_SYMBOL[currencyCode] ?? currencyCode;
  return `${symbol} ${value.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;
}
