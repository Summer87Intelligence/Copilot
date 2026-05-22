import type { ReactNode } from "react";

import type { CopilotSurfaceId } from "@/lib/copilot-surface-status";
import { CopilotSurfaceBadge } from "@/components/copilot/copilot-surface-badge";

export function CopilotPageHeader({
  eyebrow = "Summer87 Copilot",
  title,
  description,
  right,
  surfaceId,
  dense = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
  /** Bloque 12: estado de superficie (real / parcial / demo). Opcional para no ruido en layouts sin producto. */
  surfaceId?: CopilotSurfaceId;
  /** Cabecera compacta (p. ej. /copilot/hoy above-the-fold). */
  dense?: boolean;
}) {
  return (
    <header
      className={`border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.45)] px-6 backdrop-blur-sm ${dense ? "py-2" : "py-5"}`}
    >
      <div
        className={`flex flex-col lg:flex-row lg:items-start lg:justify-between ${dense ? "gap-2 lg:gap-3" : "gap-4 lg:gap-5"}`}
      >
        <div className="min-w-0 max-w-3xl flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
              {eyebrow}
            </p>
            {surfaceId ? <CopilotSurfaceBadge surfaceId={surfaceId} /> : null}
          </div>
          <h1
            className={`font-semibold tracking-tight text-[var(--copilot-ink)] ${dense ? "mt-0 text-base sm:text-lg" : "mt-1.5 text-xl sm:text-2xl"}`}
          >
            {title}
          </h1>
          {description ? (
            <p
              className={`whitespace-pre-line text-[var(--copilot-ink-muted)] ${dense ? "mt-0 text-[10px] leading-snug" : "mt-1 text-xs leading-relaxed sm:text-sm"}`}
            >
              {description}
            </p>
          ) : null}
        </div>
        {right != null ? (
          <div className="flex w-full shrink-0 flex-col gap-4 sm:max-w-md lg:w-auto lg:max-w-[min(100%,20rem)]">
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {right}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
