import { CopilotCard } from "@/components/copilot/copilot-ui";
import type { OicSeverity } from "@/lib/operacional/types";
import { OicSeverityBadge } from "@/components/copilot/operacional/oic-severity-badge";

export function OicMetricCard({
  label,
  value,
  hint,
  severity,
}: {
  label: string;
  value: string | number;
  hint?: string;
  severity?: OicSeverity;
}) {
  return (
    <CopilotCard className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          {label}
        </p>
        {severity ? <OicSeverityBadge severity={severity} /> : null}
      </div>
      <p className="text-xl font-semibold tracking-tight text-[var(--copilot-ink)]">
        {value}
      </p>
      {hint ? (
        <p className="text-xs text-[var(--copilot-ink-muted)]">{hint}</p>
      ) : null}
    </CopilotCard>
  );
}
