"use client";

import { AlertTriangle, AlertCircle } from "lucide-react";
import type { BriefingAlert } from "@/lib/decision-engine/de-types";

type Props = {
  alerts: BriefingAlert[];
};

export function RiskAlertList({ alerts }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
        Alertas ({alerts.length})
      </h3>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <AlertItem key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}

function AlertItem({ alert }: { alert: BriefingAlert }) {
  const isHigh = alert.severity === "high";
  const containerClass = isHigh
    ? "bg-[var(--copilot-tone-danger-bg)] border border-[var(--copilot-danger-border)] text-[var(--copilot-danger-text-strong)]"
    : "bg-[var(--copilot-tone-warning-bg)] border border-[var(--copilot-warning-border)] text-[var(--copilot-warning-text-strong)]";
  const iconClass = isHigh ? "text-[var(--copilot-danger-text)]" : "text-[var(--copilot-warning-text)]";
  const Icon = isHigh ? AlertCircle : AlertTriangle;

  return (
    <div className={`flex gap-3 rounded-lg px-3 py-2.5 ${containerClass}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{alert.title}</p>
        <p className="text-xs mt-0.5 opacity-80 leading-snug">{alert.description}</p>
      </div>
    </div>
  );
}
