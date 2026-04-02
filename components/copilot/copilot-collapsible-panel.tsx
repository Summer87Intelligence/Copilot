"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Panel colapsable con transición simple (grid + opacidad). Sin dependencias extra.
 */
export function CopilotCollapsiblePanel({
  title,
  defaultOpen = false,
  children,
  className = "",
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-[rgba(255,255,255,0.55)] ${className}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-[rgba(31,107,74,0.04)]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 text-sm font-semibold leading-snug text-[var(--copilot-ink)]">
          {title}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[var(--copilot-ink-muted)] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--copilot-border)] px-4 pb-4 pt-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
