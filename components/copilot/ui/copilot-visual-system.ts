export type CopilotVisualTone = "positive" | "warning" | "danger" | "neutral";

/** Shared semantic surfaces — use instead of bg-[var(--copilot-card-bg)] / stone neutrals. */
export const copilotCardSurfaceClass =
  "bg-[var(--copilot-card-bg)] text-[var(--copilot-text)]";

export const copilotPanelSurfaceClass =
  "bg-[var(--copilot-panel-bg)] text-[var(--copilot-text)]";

export const copilotSoftSurfaceClass =
  "bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]";

export const copilotTabBarClass =
  "border-b border-[var(--copilot-border)] bg-[var(--copilot-tab-bg)] backdrop-blur-sm";

export const copilotInputClass =
  "rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-3 py-2 text-sm text-[var(--copilot-text)] shadow-sm transition placeholder:text-[var(--copilot-muted)] focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

export const copilotGhostButtonClass =
  "inline-flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3.5 py-2 text-sm font-medium text-[var(--copilot-text)] shadow-sm transition hover:bg-[var(--copilot-panel-bg)]";

export const copilotDisabledStateClass =
  "disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)] disabled:opacity-100 disabled:cursor-not-allowed";

export const premiumCardClass =
  "rounded-2xl border border-[var(--copilot-border)] shadow-sm bg-[var(--copilot-card-bg)]";

export const positiveFinancialCardClass =
  "border-emerald-200/80 bg-gradient-to-br from-[var(--copilot-card-bg)] to-[var(--copilot-tone-positive-bg)]";

export const warningFinancialCardClass =
  "border-amber-200/80 bg-gradient-to-br from-[var(--copilot-card-bg)] to-[var(--copilot-tone-warning-bg)]";

export const dangerFinancialCardClass =
  "border-rose-200/80 bg-gradient-to-br from-[var(--copilot-card-bg)] to-[var(--copilot-tone-danger-bg)]";

export const neutralFinancialCardClass =
  "border-[var(--copilot-border)] bg-gradient-to-br from-[var(--copilot-card-bg)] to-[var(--copilot-tone-neutral-bg)]";

export const softCalloutClass =
  "rounded-xl border border-[var(--copilot-border)]/70 bg-[var(--copilot-soft-bg)] px-3 py-2";

export const actionCardClass =
  "rounded-2xl border border-[var(--copilot-border)] bg-gradient-to-br from-[var(--copilot-card-bg)] to-[var(--copilot-tone-neutral-bg)] shadow-sm";

export const metricValueClass =
  "font-semibold tabular-nums tracking-tight text-[var(--copilot-text)]";

export const subtleLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--copilot-muted)]";

export const statusBadgeVariants = {
  stable:
    "border-emerald-300/50 bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-badge-success-text)]",
  attention:
    "border-amber-300/50 bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-badge-warning-text)]",
  critical:
    "border-rose-300/50 bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-badge-danger-text)]",
  neutral:
    "border-[var(--copilot-border)] bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-muted)]",
} as const;

export function financialCardToneClass(tone: CopilotVisualTone): string {
  if (tone === "positive") return positiveFinancialCardClass;
  if (tone === "warning") return warningFinancialCardClass;
  if (tone === "danger") return dangerFinancialCardClass;
  return neutralFinancialCardClass;
}
