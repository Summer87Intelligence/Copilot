import type { OicReconciliationSummary } from "@/lib/operacional/types";
import { OicSeverityBadge } from "@/components/copilot/operacional/oic-severity-badge";

export function OicReconciliationSummaryBar({ data }: { data: OicReconciliationSummary }) {
  const matchPct =
    data.totalInvoices === 0
      ? 100
      : Math.round((data.matchedCount / data.totalInvoices) * 100);

  const overallSeverity =
    data.criticalCount > 0
      ? "critical"
      : data.conflictCount > 0
        ? "warning"
        : "ok";

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3">
      <div className="flex items-center gap-2">
        <OicSeverityBadge severity={overallSeverity} />
        <span className="text-sm font-semibold text-[var(--copilot-ink)]">
          {data.matchedCount}/{data.totalInvoices} facturas OK
        </span>
      </div>

      <div className="h-2 flex-1 min-w-[80px] overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]">
        <div
          className={`h-full rounded-full ${overallSeverity === "ok" ? "bg-emerald-500" : overallSeverity === "critical" ? "bg-rose-500" : "bg-amber-500"}`}
          style={{ width: `${matchPct}%` }}
        />
      </div>

      <div className="flex gap-4 text-xs text-[var(--copilot-ink-muted)]">
        {data.gapUsd > 0 && (
          <span>Gap USD: <span className="font-semibold text-rose-700">{data.gapUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span></span>
        )}
        {data.gapUyu > 0 && (
          <span>Gap UYU: <span className="font-semibold text-rose-700">{data.gapUyu.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</span></span>
        )}
        {data.criticalCount > 0 && (
          <span className="text-rose-700 font-semibold">{data.criticalCount} críticas</span>
        )}
      </div>
    </div>
  );
}
