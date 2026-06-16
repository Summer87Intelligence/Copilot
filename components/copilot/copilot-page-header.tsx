import type { ReactNode } from "react";

import type { CopilotSurfaceId } from "@/lib/copilot-surface-status";
import {
  copilotCaptionClass,
  copilotPageTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";

/**
 * Header de página sobrio: sin card, sin borde, sin fondo pesado.
 * Restaurado tras commit `0b422d9 ux: remove redundant copilot page headers`,
 * con layout más ligero para evitar el ruido visual que motivó su desactivación.
 *
 * `surfaceId` se mantiene por compatibilidad con call sites (uso futuro de telemetría
 * / contexto operacional), pero no produce efecto visual en este componente.
 */
export function CopilotPageHeader({
  eyebrow,
  title,
  description,
  right,
  dense = false,
  surfaceId,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
  surfaceId?: CopilotSurfaceId;
  dense?: boolean;
}) {
  void surfaceId;

  const paddingClass = dense
    ? "px-4 pt-3 pb-2 sm:px-6"
    : "px-4 pt-4 pb-3 sm:px-6";

  return (
    <header
      className={`flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3 ${paddingClass}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--copilot-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className={`${copilotPageTitleClass} ${eyebrow ? "mt-0.5" : ""}`.trim()}>
          {title}
        </h1>
        {description ? (
          <p className={`${copilotCaptionClass} mt-1 max-w-prose`}>{description}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
