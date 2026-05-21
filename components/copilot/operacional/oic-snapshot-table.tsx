"use client";

import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { OicSeverityBadge } from "@/components/copilot/operacional/oic-severity-badge";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";
import { OicEmptyState } from "@/components/copilot/operacional/oic-empty-state";
import { useOicSnapshots } from "@/hooks/use-oic-snapshots";
import type { OicSnapshotType } from "@/lib/operacional/types";

const typeLabel: Record<OicSnapshotType, string> = {
  health_score:       "Salud",
  pipeline_activity:  "Actividad",
  reconciliation:     "Reconciliación",
  financial_health:   "Salud Financiera",
  drift_summary:      "Drift",
  completeness_audit: "Completitud",
};

const th = "border-b border-[var(--copilot-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]";
const td = "px-3 py-2 text-sm text-[var(--copilot-ink)]";

export function OicSnapshotTable() {
  const { data, loading, error } = useOicSnapshots(50);

  if (loading && !data) return <OicSkeletonCard rows={5} />;

  if (error) {
    return (
      <CopilotCard>
        <p className="text-xs text-rose-700">{error}</p>
      </CopilotCard>
    );
  }

  return (
    <CopilotCard className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--copilot-border)]">
        <CopilotSectionTitle title="Historial de Snapshots" subtitle="Últimos 50 registros" />
      </div>

      {!data || data.length === 0 ? (
        <div className="p-4">
          <OicEmptyState title="Sin snapshots" description="Aún no se han computado snapshots para este workspace." />
        </div>
      ) : (
        <div className="overflow-auto max-h-[60vh]">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
              <tr>
                <th className={th}>Tipo</th>
                <th className={th}>Fecha</th>
                <th className={`${th} text-right`}>Score</th>
                <th className={th}>Estado</th>
                <th className={`${th} text-right`}>Items</th>
                <th className={`${th} text-right`}>Issues</th>
                <th className={th}>Origen</th>
                <th className={`${th} text-right`}>Duración</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--copilot-border)]">
              {data.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--copilot-accent-soft)]/40">
                  <td className={td}>{typeLabel[row.snapshotType]}</td>
                  <td className={`${td} tabular-nums text-xs`}>{row.snapshotDate}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {row.scoreValue != null ? row.scoreValue : "—"}
                  </td>
                  <td className={td}>
                    {row.severity ? <OicSeverityBadge severity={row.severity} /> : "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums text-xs`}>{row.itemCount ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums text-xs ${row.issueCount ? "text-amber-700 font-semibold" : ""}`}>
                    {row.issueCount ?? "—"}
                  </td>
                  <td className={`${td} text-xs`}>{row.triggeredBy}</td>
                  <td className={`${td} text-right tabular-nums text-xs text-[var(--copilot-ink-muted)]`}>
                    {row.computedDurationMs != null ? `${row.computedDurationMs}ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CopilotCard>
  );
}
