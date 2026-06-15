"use client";

import { type ReactNode } from "react";

export type CopilotKpiCardSize = "hero" | "standard" | "compact" | "mini";
export type CopilotKpiCardTone = "neutral" | "positive" | "warning" | "danger";

export type CopilotKpiCardProps = {
  size?: CopilotKpiCardSize;
  tone?: CopilotKpiCardTone;
  eyebrow?: ReactNode;
  value: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  valueClassName?: string;
  children?: ReactNode;
};

// ─── Tokens por size ─────────────────────────────────────────────────────────

const WRAPPER_BY_SIZE: Record<CopilotKpiCardSize, string> = {
  hero:
    "rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-[var(--copilot-shadow)] px-5 py-5 sm:px-6",
  standard:
    "rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-sm p-4",
  compact:
    "rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-sm px-3 py-2.5",
  mini:
    "rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2 py-1.5",
};

const EYEBROW_BY_SIZE: Record<CopilotKpiCardSize, string> = {
  hero: "text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--copilot-muted)]",
  standard: "text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]",
  compact: "text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]",
  mini: "text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]",
};

const VALUE_BY_SIZE: Record<CopilotKpiCardSize, string> = {
  hero: "text-[28px] font-bold tabular-nums tracking-tight text-[var(--copilot-ink)] sm:text-[30px]",
  standard: "text-2xl font-bold tabular-nums tracking-tight text-[var(--copilot-ink)]",
  compact: "text-base font-semibold tabular-nums text-[var(--copilot-ink)]",
  mini: "text-[12px] font-semibold tabular-nums text-[var(--copilot-ink)]",
};

const SUBTITLE_BY_SIZE: Record<CopilotKpiCardSize, string> = {
  hero: "text-xs text-[var(--copilot-muted)]",
  standard: "text-xs text-[var(--copilot-muted)]",
  compact: "text-[11px] text-[var(--copilot-muted)]",
  mini: "text-[10px] text-[var(--copilot-muted)]",
};

/**
 * El tono SOLO afecta el color del borde — nunca pinta el card entero ni el valor.
 * El valor principal queda neutro (--copilot-ink) salvo override explícito vía
 * `valueClassName`. Esto evita que estados (positive/warning/danger) tiñan toda la
 * tarjeta y rompan la jerarquía visual.
 */
const TONE_BORDER_BY: Record<CopilotKpiCardTone, string> = {
  neutral: "",
  positive: "border-[var(--copilot-success-border)]",
  warning: "border-[var(--copilot-warning-border)]",
  danger: "border-[var(--copilot-danger-border)]",
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Primitivo unificado para KPI cards en Copilot.
 *
 * 4 sizes:
 *  - `hero`: KPI principal (1-2 por pantalla). Padding amplio, valor grande,
 *    sin min-height artificial — la altura la da el contenido.
 *  - `standard`: KPI normal de sección.
 *  - `compact`: KPI denso (grids 3-4 columnas).
 *  - `mini`: chips métricos pequeños (grids 4-6 columnas).
 *
 * Reglas:
 *  - Fondo neutro siempre (`var(--copilot-card-bg)`).
 *  - `tone` solo modula el borde (sutil), no el valor ni el fondo.
 *  - `value` siempre con `tabular-nums` y `font-bold/semibold` según size.
 *  - Cero colores Tailwind hardcoded (slate/emerald/amber/rose/sky/etc.).
 */
export function CopilotKpiCard({
  size = "standard",
  tone = "neutral",
  eyebrow,
  value,
  subtitle,
  badge,
  footer,
  onClick,
  ariaLabel,
  className,
  valueClassName,
  children,
}: CopilotKpiCardProps) {
  const interactive = Boolean(onClick);

  const wrapperClass = [
    "flex flex-col text-left",
    WRAPPER_BY_SIZE[size],
    TONE_BORDER_BY[tone],
    interactive
      ? "cursor-pointer transition hover:border-[var(--copilot-accent)]/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
      : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const hasTopRow = Boolean(eyebrow) || Boolean(badge);

  const content = (
    <>
      {hasTopRow ? (
        <div className="flex items-start justify-between gap-2">
          {eyebrow ? <p className={EYEBROW_BY_SIZE[size]}>{eyebrow}</p> : <span />}
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      ) : null}

      <div
        className={`${hasTopRow ? "mt-1" : ""} ${VALUE_BY_SIZE[size]} ${valueClassName ?? ""}`.trim()}
      >
        {value}
      </div>

      {subtitle ? (
        <p className={`mt-1 ${SUBTITLE_BY_SIZE[size]}`}>{subtitle}</p>
      ) : null}

      {children ? <div className="mt-2">{children}</div> : null}

      {footer ? <div className="mt-auto pt-3">{footer}</div> : null}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={wrapperClass}
      >
        {content}
      </button>
    );
  }

  return (
    <div aria-label={ariaLabel} className={wrapperClass}>
      {content}
    </div>
  );
}
