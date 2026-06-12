"use client";

import type { CopilotSurfaceId, CopilotSurfaceKind } from "@/lib/copilot-surface-status";
import {
  copilotSurfaceKindLabelEs,
  getCopilotSurfaceMeta,
} from "@/lib/copilot-surface-status";

const toneClass: Record<CopilotSurfaceKind, string> = {
  real:
    "border-[var(--copilot-success-border)]/90 bg-[var(--copilot-tone-positive-bg)]/85 text-[var(--copilot-success-text-strong)] ring-emerald-900/10",
  partial:
    "border-[var(--copilot-warning-border)]/90 bg-[var(--copilot-tone-warning-bg)]/85 text-[var(--copilot-warning-text-strong)] ring-amber-900/10",
  demo: "border-[var(--copilot-border)]/95 bg-[var(--copilot-soft-bg)]/90 text-[var(--copilot-ink)] ring-slate-900/8",
};

/**
 * Badge único por pantalla: indica si la superficie es datos reales, parcial o demo.
 * Ver `lib/copilot-surface-status.ts` para criterio y actualización.
 */
export function CopilotSurfaceBadge({ surfaceId }: { surfaceId: CopilotSurfaceId }) {
  const meta = getCopilotSurfaceMeta(surfaceId);
  const label = copilotSurfaceKindLabelEs(meta.kind);
  return (
    <span
      role="status"
      aria-label={`Estado de datos: ${label}. ${meta.rationale}`}
      title={meta.rationale}
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ${toneClass[meta.kind]}`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
