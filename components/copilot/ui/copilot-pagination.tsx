"use client";

import { CopilotGhostButton } from "@/components/copilot/copilot-ui";

type Props = {
  /** Current page, 0-indexed */
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
};

/**
 * Numbered pagination with ellipsis for long page lists.
 * Shows at most 7 visible page buttons: "1 2 3 ... 8 9" pattern.
 * Returns null when pageCount ≤ 1.
 */
export function CopilotPagination({ page, pageCount, onPageChange }: Props) {
  if (pageCount <= 1) return null;

  const pages = buildPageWindows(page, pageCount);

  return (
    <div className="flex items-center justify-center gap-1 text-xs" role="navigation" aria-label="Paginación">
      <CopilotGhostButton
        type="button"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
      >
        ‹
      </CopilotGhostButton>

      {pages.map((item, i) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="px-1 text-[var(--copilot-ink-muted)]">…</span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item as number)}
            aria-current={page === (item as number) ? "page" : undefined}
            className={`min-w-[28px] rounded-lg px-2 py-1 text-xs font-medium transition ${
              page === (item as number)
                ? "bg-[var(--copilot-accent)] text-white shadow-sm"
                : "border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink)] hover:bg-[var(--copilot-panel-bg)]"
            }`}
          >
            {(item as number) + 1}
          </button>
        )
      )}

      <CopilotGhostButton
        type="button"
        disabled={page + 1 >= pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="Página siguiente"
      >
        ›
      </CopilotGhostButton>
    </div>
  );
}

function buildPageWindows(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i);
  }
  // Always show first 2, last 2, and a window around current
  const result: (number | "ellipsis")[] = [];
  const nearby = new Set([
    0, 1,
    current - 1, current, current + 1,
    total - 2, total - 1,
  ]);
  const visible = [...nearby].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);

  for (let i = 0; i < visible.length; i++) {
    const p = visible[i];
    if (i > 0 && p - visible[i - 1]! > 1) {
      result.push("ellipsis");
    }
    result.push(p);
  }
  return result;
}
