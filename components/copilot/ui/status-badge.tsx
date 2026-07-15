import type { ReactNode } from "react";

import { statusBadgeVariants } from "@/components/copilot/ui/copilot-visual-system";
import type { StatusTone } from "@/lib/ui/status-badge-model";

/**
 * StatusBadge (DS-Core) — badge único con tono semántico.
 *
 * Reemplaza los badges ad-hoc dispersos. El color vive en `statusBadgeVariants`
 * (light + dark via CSS vars); acá solo se mapea tono → variante.
 */

const TONE_TO_VARIANT: Record<StatusTone, keyof typeof statusBadgeVariants> = {
  positive: "stable",
  warning: "attention",
  danger: "critical",
  neutral: "neutral",
};

export type StatusBadgeProps = {
  tone?: StatusTone;
  /** Muestra un dot del color del texto a la izquierda. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
};

export function StatusBadge({
  tone = "neutral",
  dot = false,
  children,
  className = "",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeVariants[TONE_TO_VARIANT[tone]]} ${className}`}
    >
      {dot ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
