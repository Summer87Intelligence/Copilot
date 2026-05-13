import { CopilotCard } from "@/components/copilot/copilot-ui";
import { getSeverityBadge, type CopilotSeverityState } from "@/lib/copilot-severity-styles";

export type CopilotOperationalMetric = {
  label: string;
  value: string | number;
};

type Props = {
  title: string;
  status: string;
  statusTone?: CopilotSeverityState;
  metrics: CopilotOperationalMetric[];
  footnote?: string;
};

export function CopilotOperationalEmptyState({
  title,
  status,
  statusTone = "healthy",
  metrics,
  footnote,
}: Props) {
  return (
    <CopilotCard className="border-dashed border-[var(--copilot-border)] bg-white/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h2>
          <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{status}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getSeverityBadge(statusTone)}`}
        >
          Operativo
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-[var(--copilot-border)] bg-white/80 px-3 py-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {metric.label}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
      {footnote ? (
        <p className="mt-3 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">{footnote}</p>
      ) : null}
    </CopilotCard>
  );
}
