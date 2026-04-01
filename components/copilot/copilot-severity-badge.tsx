import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";

const severityConfig: Record<
  CopilotSeverity,
  { label: string; className: string; dotClassName: string }
> = {
  critical: {
    label: "Crítica",
    className: "bg-rose-100/90 text-rose-900 ring-1 ring-rose-300/60",
    dotClassName: "bg-rose-500",
  },
  high: {
    label: "Alta",
    className: "bg-orange-100/90 text-orange-900 ring-1 ring-orange-300/60",
    dotClassName: "bg-orange-500",
  },
  medium: {
    label: "Media",
    className: "bg-amber-100/80 text-amber-900 ring-1 ring-amber-300/60",
    dotClassName: "bg-amber-500",
  },
  low: {
    label: "Baja",
    className: "bg-emerald-100/80 text-emerald-900 ring-1 ring-emerald-300/60",
    dotClassName: "bg-emerald-500",
  },
};

export function copilotSeverityLabel(severity: CopilotSeverity) {
  return severityConfig[severity].label;
}

export function CopilotSeverityBadge({
  severity,
  compact = false,
}: {
  severity: CopilotSeverity;
  compact?: boolean;
}) {
  const config = severityConfig[severity];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.className}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${config.dotClassName}`}
      />
      {compact ? severity.toUpperCase() : config.label}
    </span>
  );
}
