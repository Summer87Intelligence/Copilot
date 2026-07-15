import type { ReactNode } from "react";

/**
 * EmptyState (DS-Core) — estado vacío único y cuidado.
 *
 * Reemplaza los tres patrones previos (copilot-premium-empty-state /
 * copilot-operational-empty-state / copilot-empty-panel) y los "cuerpos en
 * blanco" de las pantallas en carga sin datos.
 */

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** CTA opcional (botón o link ya estilado). */
  action?: ReactNode;
  /** `compact` para usarse dentro de cards; `panel` (default) como bloque. */
  variant?: "panel" | "compact";
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "panel",
  className = "",
}: EmptyStateProps) {
  const pad = variant === "compact" ? "px-4 py-6" : "px-6 py-10";
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)]/40 text-center ${pad} ${className}`}
    >
      {icon ? (
        <div className="text-[var(--copilot-ink-muted)]" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
