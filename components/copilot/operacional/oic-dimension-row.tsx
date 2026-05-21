import type { OicHealthDimension } from "@/lib/operacional/types";
import { OicSeverityBadge } from "@/components/copilot/operacional/oic-severity-badge";

const barColor: Record<string, string> = {
  ok:       "bg-emerald-500",
  warning:  "bg-amber-500",
  degraded: "bg-orange-500",
  critical: "bg-rose-500",
};

export function OicDimensionRow({ dim }: { dim: OicHealthDimension }) {
  const pct = Math.max(0, Math.min(100, dim.score));
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{dim.label}</p>
        {dim.detail ? (
          <p className="mt-0.5 truncate text-xs text-[var(--copilot-ink-muted)]">{dim.detail}</p>
        ) : null}
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor[dim.severity]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="text-xs font-semibold tabular-nums text-[var(--copilot-ink-muted)]">
        {dim.score}
      </span>
      <OicSeverityBadge severity={dim.severity} />
    </div>
  );
}
