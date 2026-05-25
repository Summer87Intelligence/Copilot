"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AgentPriority, AgentSeverity } from "@/lib/copilot-agents/build-daily-executive-brief";

const SEVERITY_STYLES: Record<
  AgentSeverity,
  { badge: string; bar: string; label: string }
> = {
  critical: {
    badge: "bg-rose-50 text-rose-700 border border-rose-200",
    bar: "bg-rose-500",
    label: "Crítica",
  },
  high: {
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
    bar: "bg-amber-400",
    label: "Alta",
  },
  medium: {
    badge: "bg-blue-50 text-blue-700 border border-blue-100",
    bar: "bg-blue-400",
    label: "Media",
  },
  low: {
    badge: "bg-slate-100 text-slate-500 border border-slate-200",
    bar: "bg-slate-300",
    label: "Baja",
  },
};

function formatAmount(amount: number, currency: "UYU" | "USD"): string {
  const prefix = currency === "UYU" ? "UYU $ " : "USD U$S ";
  return `${prefix}${amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

export function AgentPriorityCard({
  priority,
  index,
}: {
  priority: AgentPriority;
  index: number;
}) {
  const style = SEVERITY_STYLES[priority.severity];

  return (
    <div className="flex gap-3 rounded-xl border border-[var(--copilot-border)] bg-white p-4 transition-shadow hover:shadow-sm">
      {/* Severity bar + number */}
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(44,40,37,0.06)] text-[11px] font-bold text-[var(--copilot-ink-muted)]">
          {index + 1}
        </span>
        <div className={`w-1 flex-1 rounded-full ${style.bar} opacity-60`} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-[13px] font-semibold leading-snug text-[var(--copilot-ink)]">
            {priority.title}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${style.badge}`}
          >
            {style.label}
          </span>
        </div>

        <p className="mt-1 text-[12px] leading-relaxed text-[var(--copilot-ink-muted)]">
          {priority.reason}
        </p>

        {priority.amount != null && priority.currency ? (
          <p className="mt-1 text-[12px] font-semibold tabular-nums text-[var(--copilot-ink)]">
            {formatAmount(priority.amount, priority.currency)}
          </p>
        ) : null}

        <div className="mt-2.5">
          <Link
            href={priority.href}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--copilot-accent)] transition-opacity hover:opacity-75"
          >
            {priority.ctaLabel}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
