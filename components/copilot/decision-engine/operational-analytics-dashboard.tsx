"use client";

import type {
  OperationalAnalyticsSnapshot,
  OperatorAnalyticsRow,
  WorkloadBand,
} from "@/lib/decision-engine/de-types";
import { WORKLOAD_BAND_LABELS } from "@/lib/decision-engine/de-types";

const WORKLOAD_BADGE_CLASS: Record<WorkloadBand, string> = {
  normal:     "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border-[var(--copilot-success-border)]",
  elevated:   "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border-[var(--copilot-warning-border)]",
  overloaded: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border-[var(--copilot-warning-border)]",
  critical:   "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border-[var(--copilot-danger-border)]",
};

function formatHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1)} h`;
}

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "success";
};

function KpiCard({ label, value, hint, tone = "default" }: KpiCardProps) {
  const toneClass =
    tone === "warning"
      ? "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)]/50"
      : tone === "success"
        ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)]/40"
        : "border-[var(--copilot-border)] bg-[var(--copilot-surface)]";

  return (
    <div className={`rounded-lg border px-2.5 py-2 min-w-0 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] truncate">
        {label}
      </p>
      <p className="text-lg font-bold text-[var(--copilot-text)] tabular-nums leading-tight mt-0.5">
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-[var(--copilot-text-muted)] mt-0.5 truncate">{hint}</p>
      )}
    </div>
  );
}

function OperatorRow({ op }: { op: OperatorAnalyticsRow }) {
  const slaPct =
    op.assigned_total === 0
      ? 100
      : Math.round(((op.assigned_total - op.sla_breaches) / op.assigned_total) * 100);

  return (
    <tr className="border-b border-[var(--copilot-border)]/60 last:border-0">
      <td className="py-1.5 pr-2 text-[11px] font-medium text-[var(--copilot-text)] truncate max-w-[120px]">
        {op.display_name}
      </td>
      <td className="py-1.5 px-1 text-[11px] tabular-nums text-center">{op.assigned_total}</td>
      <td className="py-1.5 px-1 text-[11px] tabular-nums text-center text-[var(--copilot-danger-text-strong)]">
        {op.active_critical}
      </td>
      <td className="py-1.5 px-1 text-[11px] tabular-nums text-center">{slaPct}%</td>
      <td className="py-1.5 px-1 text-[11px] tabular-nums text-center text-[var(--copilot-text-muted)]">
        {formatHours(op.avg_response_time_hours)}
      </td>
      <td className="py-1.5 pl-1 text-right">
        <span
          className={`inline-flex rounded border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${WORKLOAD_BADGE_CLASS[op.workload_band]}`}
        >
          {WORKLOAD_BAND_LABELS[op.workload_band]}
        </span>
      </td>
    </tr>
  );
}

export type OperationalAnalyticsDashboardProps = {
  analytics: OperationalAnalyticsSnapshot | null;
  loading?: boolean;
  error?: string | null;
};

export function OperationalAnalyticsDashboard({
  analytics,
  loading = false,
  error = null,
}: OperationalAnalyticsDashboardProps) {
  if (loading && !analytics) {
    return (
      <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-4 py-3">
        <p className="text-xs text-[var(--copilot-text-muted)]">Cargando estado operacional…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-[11px] text-[var(--copilot-warning-text-strong)]">
        {error}
      </div>
    );
  }

  if (!analytics) return null;

  const { global, operators, sla } = analytics;

  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-gradient-to-b from-[var(--copilot-surface)] to-[var(--copilot-surface-alt)]/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--copilot-border)]">
        <h2 className="text-sm font-semibold text-[var(--copilot-text)]">Estado operacional</h2>
        <p className="text-[10px] text-[var(--copilot-text-muted)] mt-0.5">
          SLA {sla.compliance_pct}% · {global.active_cases} casos activos
        </p>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <KpiCard
            label="SLA compliance"
            value={`${sla.compliance_pct}%`}
            hint={`${sla.breached_total} vencidos`}
            tone={sla.compliance_pct < 80 ? "warning" : "default"}
          />
          <KpiCard
            label="Casos críticos"
            value={global.critical_open}
            tone={global.critical_open > 0 ? "warning" : "default"}
          />
          <KpiCard
            label="Follow-ups hoy"
            value={global.followups_due_today}
            hint="vencen hoy"
          />
          <KpiCard
            label="Backlog"
            value={global.operational_backlog}
            hint={`${global.unassigned_cases} sin asignar`}
          />
          <KpiCard
            label="Recuperados hoy"
            value={global.recovered_today}
            tone="success"
          />
        </div>

        {operators.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[420px] border-collapse">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
                  <th className="text-left pb-1 pr-2">Operador</th>
                  <th className="pb-1 px-1 text-center">Activos</th>
                  <th className="pb-1 px-1 text-center">Críticos</th>
                  <th className="pb-1 px-1 text-center">SLA</th>
                  <th className="pb-1 px-1 text-center">Respuesta</th>
                  <th className="text-right pb-1 pl-1">Carga</th>
                </tr>
              </thead>
              <tbody>
                {operators.slice(0, 12).map((op) => (
                  <OperatorRow key={op.user_id} op={op} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
