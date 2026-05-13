import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";
import {
  getSeverityBadge,
  getSeverityStyles,
  type CopilotSeverityState,
} from "@/lib/copilot-severity-styles";

const severityState: Record<CopilotSeverity, CopilotSeverityState> = {
  critical: "critical",
  high: "danger",
  medium: "warning",
  low: "healthy",
};

const labelMap: Record<CopilotSeverity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export function copilotSeverityLabel(severity: CopilotSeverity) {
  return labelMap[severity];
}

export function CopilotSeverityBadge({
  severity,
  compact = false,
}: {
  severity: CopilotSeverity;
  compact?: boolean;
}) {
  const state = severityState[severity];
  const styles = getSeverityStyles(state);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${getSeverityBadge(state)}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {compact ? severity.toUpperCase() : copilotSeverityLabel(severity)}
    </span>
  );
}
