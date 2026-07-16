"use client";

import { copilotCardStandardClass, copilotSectionTitleClass, copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import type { SalesOverview } from "@/lib/sales/sales-api";
import { formatUyu, formatUsd, formatPct, formatDelta, deltaTone, formatQuantity } from "@/components/copilot/ventas/ventas-format";

export function VentasComparativoTab({
  overview,
  comparisonLabel,
}: {
  overview: SalesOverview;
  comparisonLabel: string;
}) {
  const cur = overview.comparison.current;
  const prev = overview.comparison.previous;
  const cmp = overview.comparison;

  const currencyRows = (["UYU", "USD"] as const).map((c) => {
    const fmt = c === "UYU" ? formatUyu : formatUsd;
    return {
      currency: c,
      current: fmt(cur.salesEmitted[c]),
      previous: fmt(prev.salesEmitted[c]),
      delta: fmt(cmp.salesDeltaByCurrency[c]),
      pct: cmp.salesPctByCurrency[c],
      deltaRaw: cmp.salesDeltaByCurrency[c],
    };
  });

  return (
    <div className="space-y-4">
      <p className={copilotCaptionClass}>
        Período actual {overview.period.from} → {overview.period.to} vs {comparisonLabel} (
        {overview.comparisonWindow.from} → {overview.comparisonWindow.to}).
      </p>

      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Facturación por moneda</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--copilot-border)] text-left text-[var(--copilot-ink-muted)]">
                <th className="py-2 font-semibold">Moneda</th>
                <th className="py-2 text-right font-semibold">Actual</th>
                <th className="py-2 text-right font-semibold">Anterior</th>
                <th className="py-2 text-right font-semibold">Diferencia</th>
                <th className="py-2 text-right font-semibold">Variación</th>
              </tr>
            </thead>
            <tbody>
              {currencyRows.map((r) => (
                <tr key={r.currency} className="border-b border-[var(--copilot-border)] last:border-0">
                  <td className="py-2 font-semibold text-[var(--copilot-ink)]">{r.currency}</td>
                  <td className="py-2 text-right tabular-nums text-[var(--copilot-ink)]">{r.current}</td>
                  <td className="py-2 text-right tabular-nums text-[var(--copilot-ink-muted)]">{r.previous}</td>
                  <td className="py-2 text-right tabular-nums text-[var(--copilot-ink)]">{r.delta}</td>
                  <td className="py-2 text-right">
                    <StatusBadge tone={r.pct === null ? "neutral" : deltaTone(r.deltaRaw)}>{formatPct(r.pct)}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Métricas operativas</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CompareTile label="Facturas" current={String(cur.invoiceCount)} previous={String(prev.invoiceCount)} delta={formatDelta(cmp.invoiceDelta)} tone={deltaTone(cmp.invoiceDelta)} />
          <CompareTile label="Unidades / servicios" current={formatQuantity(cur.unitsSold)} previous={formatQuantity(prev.unitsSold)} delta={formatDelta(cmp.unitsDelta)} tone={deltaTone(cmp.unitsDelta)} />
          <CompareTile
            label="Clientes"
            current={String(cur.newCustomers + cur.recurringCustomers)}
            previous={String(prev.newCustomers + prev.recurringCustomers)}
            delta={formatDelta(cmp.customerDelta)}
            tone={deltaTone(cmp.customerDelta)}
          />
        </div>
      </section>
    </div>
  );
}

function CompareTile({
  label,
  current,
  previous,
  delta,
  tone,
}: {
  label: string;
  current: string;
  previous: string;
  delta: string;
  tone: "positive" | "danger" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-[var(--copilot-border)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">{current}</p>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-[var(--copilot-ink-muted)]">Ant. {previous}</span>
        <StatusBadge tone={tone}>{delta}</StatusBadge>
      </div>
    </div>
  );
}
