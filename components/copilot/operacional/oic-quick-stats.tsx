"use client";

import { OicMetricCard } from "@/components/copilot/operacional/oic-metric-card";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";
import { useOicReconciliacion } from "@/hooks/use-oic-reconciliacion";
import { useOicActividad } from "@/hooks/use-oic-actividad";

function fmtCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function OicQuickStats() {
  const rec = useOicReconciliacion();
  const act = useOicActividad();

  const loading = (rec.loading && !rec.data) || (act.loading && !act.data);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <OicSkeletonCard key={i} rows={2} />)}
      </div>
    );
  }

  const rd = rec.data;
  const ad = act.data;

  const failPct = ad ? Math.round(ad.failureRateLastDay * 100) : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <OicMetricCard
        label="Facturas activas"
        value={rd?.totalInvoices ?? "—"}
        hint={rd ? `${rd.matchedCount} sin conflicto` : undefined}
        severity={rd && rd.criticalCount > 0 ? "critical" : rd && rd.conflictCount > 0 ? "warning" : rd ? "ok" : undefined}
      />
      <OicMetricCard
        label="Gap USD"
        value={rd ? fmtCurrency(rd.gapUsd, "USD") : "—"}
        hint={rd && rd.criticalCount > 0 ? `${rd.criticalCount} críticas` : undefined}
        severity={rd && rd.gapUsd > 500 ? "critical" : rd && rd.gapUsd > 0 ? "warning" : rd ? "ok" : undefined}
      />
      <OicMetricCard
        label="Gap UYU"
        value={rd ? fmtCurrency(rd.gapUyu, "UYU") : "—"}
        severity={rd && rd.gapUyu > 10000 ? "critical" : rd && rd.gapUyu > 0 ? "warning" : rd ? "ok" : undefined}
      />
      <OicMetricCard
        label="Fallas pipelines 24h"
        value={failPct != null ? `${failPct}%` : "—"}
        hint={ad ? `${ad.recentRuns.filter((r) => r.status === "failed").length} runs fallidos` : undefined}
        severity={failPct != null && failPct > 50 ? "critical" : failPct != null && failPct > 20 ? "warning" : failPct != null ? "ok" : undefined}
      />
    </div>
  );
}
