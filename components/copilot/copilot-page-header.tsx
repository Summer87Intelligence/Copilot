import type { ReactNode } from "react";

import type { CopilotSurfaceId } from "@/lib/copilot-surface-status";
import { CopilotSurfaceBadge } from "@/components/copilot/copilot-surface-badge";

export function CopilotPageHeader({
  eyebrow = "Summer87 Copilot",
  title,
  description,
  right,
  surfaceId,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
  /** Bloque 12: estado de superficie (real / parcial / demo). Opcional para no ruido en layouts sin producto. */
  surfaceId?: CopilotSurfaceId;
}) {
  return (
    <header className="border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.45)] px-6 py-7 backdrop-blur-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 max-w-3xl flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
              {eyebrow}
            </p>
            {surfaceId ? <CopilotSurfaceBadge surfaceId={surfaceId} /> : null}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--copilot-ink)] sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
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
