"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight, PanelRight } from "lucide-react";

export type CopilotInteractiveTextIcon = "none" | "chevron" | "external" | "panel";

const iconMap = {
  chevron: ChevronRight,
  external: ArrowUpRight,
  panel: PanelRight,
} as const;

/**
 * Affordance cuando el padre ya es un control grande (p. ej. `button` de tarjeta):
 * el título refleja hover del grupo sin duplicar color de link clásico.
 */
export const copilotInteractiveTextGroupAffordance =
  "transition-colors duration-200 group-hover:text-[var(--copilot-accent)] decoration-dotted underline-offset-[3px] group-hover:underline";

const baseButtonClass =
  "inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-left font-medium text-[var(--copilot-accent)]/95 transition-colors duration-200 hover:text-[var(--copilot-accent)] hover:underline hover:decoration-dotted hover:underline-offset-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)] disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]";

export function CopilotInteractiveText({
  children,
  onClick,
  className = "",
  icon = "none",
  layout = "inline",
  disabled = false,
  type = "button",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  icon?: CopilotInteractiveTextIcon;
  layout?: "inline" | "block";
  disabled?: boolean;
  type?: "button" | "submit";
  "aria-label"?: string;
}) {
  const Icon = icon !== "none" ? iconMap[icon] : null;
  const layoutClass = layout === "block" ? "flex w-full justify-start" : "";

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`${baseButtonClass} ${layoutClass} ${className}`.trim()}
    >
      <span
        className={
          layout === "block"
            ? "min-w-0 flex-1 truncate text-left"
            : "min-w-0 truncate"
        }
      >
        {children}
      </span>
      {Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      ) : null}
    </button>
  );
}
