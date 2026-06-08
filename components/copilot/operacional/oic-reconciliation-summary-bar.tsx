import type { OicReconciliationSummary } from "@/lib/operacional/types";
import { OicSeverityBadge } from "@/components/copilot/operacional/oic-severity-badge";

export function OicReconciliationSummaryBar({ data }: { data: OicReconciliationSummary }) {
  const matchPct =
    data.totalChecked === 0
      ? 100
      : Math.round((data.okCount / data.totalChecked) * 100);

  // status viene del servicio y garantiza coherencia:
  // conflictCount === 0 → status === "ok" siempre
  const barColorClass =
    data.status === "ok"       ? "bg-emerald-500"
    : data.status === "critical" ? "bg-rose-500"
    : "bg-amber-500";

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
      <div className="flex items-center gap-2">
        <OicSeverityBadge severity={data.status} />
        <span className="text-sm font-semibold text-[var(--copilot-ink)]">
          {data.okCount}/{data.totalChecked} facturas OK
        </span>
      </div>

      <div className="h-2 flex-1 min-w-[80px] overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]">
        <div className={`h-full rounded-full ${barColorClass}`} style={{ width: `${matchPct}%` }} />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-[var(--copilot-ink-muted)]">
        {data.gapUsd > 0 && (
          <span>
            Gap USD:{" "}
            <span className="font-semibold text-rose-700">
              {data.gapUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </span>
        )}
        {data.gapUyu > 0 && (
          <span>
            Gap UYU:{" "}
            <span className="font-semibold text-rose-700">
              {data.gapUyu.toLocaleString("es-AR", { minimumFractionDigits: 0 })}
            </span>
          </span>
        )}
        {/* Solo mostrar desglose de conflictos si los hay */}
        {data.conflictCount > 0 && (
          <span className="font-semibold text-[var(--copilot-ink)]">
            {data.conflictCount} conflicto{data.conflictCount > 1 ? "s" : ""}
            {data.criticalCount > 0 && ` (${data.criticalCount} crítico${data.criticalCount > 1 ? "s" : ""})`}
          </span>
        )}
        {/* Histórico separado y con etiqueta explícita */}
        {(data.historicalAuditCritical > 0 || data.historicalAuditWarning > 0) && (
          <span className="rounded bg-[rgba(44,40,37,0.06)] px-1.5 py-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
            Hist. 30d: {data.historicalAuditCritical} críticas · {data.historicalAuditWarning} warnings
          </span>
        )}
      </div>
    </div>
  );
}
