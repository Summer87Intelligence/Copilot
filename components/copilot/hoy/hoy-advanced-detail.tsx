"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { HOY_COCKPIT } from "@/lib/copilot-hoy-ui-contract";

export function HoyAdvancedDetail({
  expanded,
  onExpandedChange,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-1 rounded-lg border border-dashed border-black/[0.08] bg-[rgba(44,40,37,0.02)]">
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
          {HOY_COCKPIT.advancedTitle}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--copilot-ink-muted)]/70 transition ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="space-y-3 border-t border-black/[0.06] px-3 pb-3 pt-2 opacity-95">
          {children}
        </div>
      ) : null}
    </section>
  );
}
