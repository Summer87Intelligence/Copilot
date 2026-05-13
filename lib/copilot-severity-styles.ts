export type CopilotSeverityState =
  | "healthy"
  | "info"
  | "warning"
  | "danger"
  | "critical"
  | "neutral";

type SeverityToken = {
  badge: string;
  border: string;
  surface: string;
  dot: string;
  label: string;
};

const SEVERITY_TOKENS: Record<CopilotSeverityState, SeverityToken> = {
  healthy: {
    badge: "bg-emerald-100/80 text-emerald-900 ring-1 ring-emerald-200/80",
    border: "border-emerald-200/80",
    surface: "bg-emerald-50/60",
    dot: "bg-emerald-500",
    label: "Saludable",
  },
  info: {
    badge: "bg-sky-100/80 text-sky-900 ring-1 ring-sky-200/80",
    border: "border-sky-200/80",
    surface: "bg-sky-50/60",
    dot: "bg-sky-500",
    label: "Info",
  },
  warning: {
    badge: "bg-amber-100/80 text-amber-900 ring-1 ring-amber-200/80",
    border: "border-amber-200/80",
    surface: "bg-amber-50/60",
    dot: "bg-amber-500",
    label: "Atención",
  },
  danger: {
    badge: "bg-orange-100/90 text-orange-900 ring-1 ring-orange-300/60",
    border: "border-orange-200/80",
    surface: "bg-orange-50/60",
    dot: "bg-orange-500",
    label: "Riesgo",
  },
  critical: {
    badge: "bg-rose-100/90 text-rose-900 ring-1 ring-rose-300/60",
    border: "border-rose-200/80",
    surface: "bg-rose-50/60",
    dot: "bg-rose-500",
    label: "Crítico",
  },
  neutral: {
    badge: "bg-[rgba(44,40,37,0.06)] text-[var(--copilot-ink)] ring-1 ring-[var(--copilot-border)]",
    border: "border-[var(--copilot-border)]",
    surface: "bg-white/70",
    dot: "bg-[var(--copilot-ink-muted)]",
    label: "Neutral",
  },
};

export function getSeverityStyles(state: CopilotSeverityState): SeverityToken {
  return SEVERITY_TOKENS[state];
}

export function getSeverityBorder(state: CopilotSeverityState): string {
  return SEVERITY_TOKENS[state].border;
}

export function getSeverityBadge(state: CopilotSeverityState): string {
  return SEVERITY_TOKENS[state].badge;
}

export function mapAlertPriorityToSeverityState(
  priority: "critical" | "high" | "medium"
): CopilotSeverityState {
  if (priority === "critical") return "critical";
  if (priority === "high") return "danger";
  return "warning";
}
