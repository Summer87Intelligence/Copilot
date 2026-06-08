"use client";

import type { CockpitQuickInsight } from "@/lib/copilot-hoy-cockpit-view";

const PREFIX = {
  ok: "✓ ",
  warn: "⚠ ",
  danger: "⚠ ",
} as const;

function insightStyle(item: CockpitQuickInsight): string {
  const base = "border bg-[var(--copilot-card-bg)]/60 text-slate-700";
  if (item.id === "attention") {
    return `${base} border-amber-200/50 text-amber-800`;
  }
  if (item.id === "risk" || item.tone === "danger") {
    return `${base} border-rose-200/50 text-rose-800`;
  }
  if (item.id === "afterPayments") {
    return `${base} border-teal-200/50 text-teal-800`;
  }
  if (item.id === "cover30" || item.id === "liquidity" || item.id === "period") {
    return `${base} border-emerald-200/50 text-emerald-800`;
  }
  if (item.tone === "warn") {
    return `${base} border-amber-200/50 text-amber-800`;
  }
  return `${base} border-slate-200/60 text-slate-600`;
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
