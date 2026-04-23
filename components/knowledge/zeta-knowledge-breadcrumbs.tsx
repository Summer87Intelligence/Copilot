"use client";

import { ChevronRight } from "lucide-react";

export type ZetaKnowledgeCrumb = { label: string };

export function ZetaKnowledgeBreadcrumbs({ items }: { items: ZetaKnowledgeCrumb[] }) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="Migas de pan"
      className="flex flex-wrap items-center gap-0.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]"
    >
      {items.map((c, i) => (
        <span key={`${i}-${c.label}`} className="flex min-w-0 max-w-full items-center gap-0.5">
          {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-45" aria-hidden /> : null}
          <span
            className={
              i === items.length - 1
                ? "min-w-0 font-semibold text-[var(--copilot-ink)]"
                : "min-w-0 shrink-0 truncate opacity-90"
            }
          >
            {c.label}
          </span>
        </span>
      ))}
    </nav>
  );
}
