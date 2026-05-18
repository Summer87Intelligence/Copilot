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
    ? "bg-rose-50 border border-rose-200 text-rose-800"
    : "bg-amber-50 border border-amber-200 text-amber-800";
  const iconClass = isHigh ? "text-rose-500" : "text-amber-500";
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
