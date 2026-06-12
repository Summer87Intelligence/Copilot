"use client";

import type { CockpitQuickInsight } from "@/lib/copilot-hoy-cockpit-view";

const PREFIX = {
  ok: "✓ ",
  warn: "⚠ ",
  danger: "⚠ ",
} as const;

function insightStyle(item: CockpitQuickInsight): string {
  const base =
    "border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 text-[var(--copilot-ink)]";
  if (item.id === "attention") {
    return `${base} bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-badge-warning-text)]`;
  }
  if (item.id === "risk" || item.tone === "danger") {
    return `${base} bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-badge-danger-text)]`;
  }
  if (item.id === "afterPayments") {
    return `${base} bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-badge-success-text)]`;
  }
  if (item.id === "cover30" || item.id === "liquidity" || item.id === "period") {
    return `${base} bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-badge-success-text)]`;
  }
  if (item.tone === "warn") {
    return `${base} bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-badge-warning-text)]`;
  }
  return `${base} text-[var(--copilot-ink-muted)]`;
}

export function HoyQuickInsights({ insights }: { insights: CockpitQuickInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-3">
      {insights.map((item) => (
        <div
          key={item.id}
          className={`flex h-8 min-w-0 items-center rounded-xl px-3 text-xs font-normal ${insightStyle(item)}`}
        >
          <span className="truncate">
            {PREFIX[item.tone]}
            {item.text}
          </span>
        </div>
      ))}
    </div>
  );
}
