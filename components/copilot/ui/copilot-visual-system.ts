export type CopilotVisualTone = "positive" | "warning" | "danger" | "neutral";

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const COPILOT_PAGE_GAP = "space-y-4";
export const COPILOT_SECTION_GAP = "space-y-3";
export const COPILOT_GRID_GAP = "gap-3";
export const COPILOT_TABLE_ROW = "py-1.5";

// ─── Card variants ───────────────────────────────────────────────────────────

/** Métricas pequeñas, listas operativas. */
export const copilotCardCompactClass =
  "rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-3 shadow-sm";

/** Secciones normales (default). */
export const copilotCardStandardClass =
  "rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-[var(--copilot-shadow)] sm:p-5";

/** Máximo 1–2 por pantalla — resumen ejecutivo. */
export const copilotCardHeroClass =
  "rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3 shadow-sm sm:px-5";

/** Tablas y listas operativas. */
export const copilotTableShellClass =
  "overflow-x-auto rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]";

// ─── Typography ──────────────────────────────────────────────────────────────

export const copilotPageTitleClass =
  "text-lg font-semibold tracking-tight text-[var(--copilot-text)]";

export const copilotSectionTitleClass =
  "text-sm font-semibold tracking-tight text-[var(--copilot-text)]";

export const copilotMetricLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--copilot-muted)]";

export const copilotMetricValueClass =
  "text-xl font-semibold tabular-nums tracking-tight text-[var(--copilot-text)] sm:text-2xl";

export const copilotTableHeaderClass =
  "bg-[var(--copilot-table-header-bg)] text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]";

export const copilotTableBodyClass = "text-sm text-[var(--copilot-text)]";

export const copilotCaptionClass = "text-xs leading-relaxed text-[var(--copilot-muted)]";

// ─── Surfaces (legacy aliases kept) ──────────────────────────────────────────

export const copilotCardSurfaceClass =
  "bg-[var(--copilot-card-bg)] text-[var(--copilot-text)]";

export const copilotPanelSurfaceClass =
  "bg-[var(--copilot-panel-bg)] text-[var(--copilot-text)]";

export const copilotSoftSurfaceClass =
  "bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]";

export const copilotTabBarClass =
  "border-b border-[var(--copilot-border)] bg-[var(--copilot-tab-bg)] backdrop-blur-sm";

export const copilotInputClass =
  "rounded-xl border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-3 py-2 text-sm text-[var(--copilot-text)] shadow-sm transition placeholder:text-[var(--copilot-muted)] focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

export const copilotGhostButtonClass =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-transparent bg-transparent px-4 text-sm font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-accent-soft)]";

export const copilotSectionCardClass = copilotCardStandardClass;

export const copilotChipClass =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

export const copilotDisabledStateClass =
  "disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)] disabled:opacity-100 disabled:cursor-not-allowed";

export const premiumCardClass = copilotCardCompactClass;

/**
 * Card shells con fondo NEUTRO en todas las variantes.
 * El acento por tono se aplica únicamente en badge / dot / monto / borde sutil.
 * Esto evita que cards enteras queden teñidas de verde/amber/rojo en dark mode.
 * El nombre de cada export se conserva por compatibilidad con consumers existentes.
 */
const neutralCardShell =
  "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]";

export const positiveFinancialCardClass = neutralCardShell;
export const warningFinancialCardClass = neutralCardShell;
export const dangerFinancialCardClass = neutralCardShell;
export const neutralFinancialCardClass = neutralCardShell;

export const softCalloutClass =
  "rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2";

export const actionCardClass =
  "rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-sm";

export const metricValueClass =
  "font-semibold tabular-nums tracking-tight text-[var(--copilot-text)]";

export const subtleLabelClass = copilotMetricLabelClass;

export const statusBadgeVariants = {
  stable:
    "border-[var(--copilot-border)] bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-badge-success-text)]",
  attention:
    "border-[var(--copilot-border)] bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-badge-warning-text)]",
  critical:
    "border-[var(--copilot-border)] bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-badge-danger-text)]",
  neutral:
    "border-[var(--copilot-border)] bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-muted)]",
} as const;

export function financialCardToneClass(tone: CopilotVisualTone): string {
  if (tone === "positive") return positiveFinancialCardClass;
  if (tone === "warning") return warningFinancialCardClass;
  if (tone === "danger") return dangerFinancialCardClass;
  return neutralFinancialCardClass;
}

export function riskBadgeClass(risk: "healthy" | "attention" | "critical"): string {
  if (risk === "critical") return statusBadgeVariants.critical;
  if (risk === "attention") return statusBadgeVariants.attention;
  return statusBadgeVariants.stable;
}

// ─── Semantic text / surfaces (light + dark via CSS vars) ───────────────────

export const copilotSuccessTextClass = "text-[var(--copilot-success-text)]";
export const copilotSuccessTextStrongClass = "text-[var(--copilot-success-text-strong)]";
export const copilotWarningTextClass = "text-[var(--copilot-warning-text)]";
export const copilotWarningTextStrongClass = "text-[var(--copilot-warning-text-strong)]";
export const copilotDangerTextClass = "text-[var(--copilot-danger-text)]";
export const copilotDangerTextStrongClass = "text-[var(--copilot-danger-text-strong)]";

export const copilotSuccessSurfaceClass = "bg-[var(--copilot-tone-positive-bg)]";
export const copilotWarningSurfaceClass = "bg-[var(--copilot-tone-warning-bg)]";
export const copilotDangerSurfaceClass = "bg-[var(--copilot-tone-danger-bg)]";

export const copilotWarningCalloutClass =
  "rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]";

export const copilotDangerCalloutClass =
  "rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]";

export const copilotSuccessCalloutClass =
  "rounded-xl border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]";

export const copilotChipActiveClass =
  "border-[var(--copilot-accent)] bg-[var(--copilot-chip-active-bg)] text-[var(--copilot-ink)] shadow-sm";

export const copilotOnAccentTextClass = "text-[var(--copilot-on-accent)]";

export const statusDotClass = {
  ok: "bg-[var(--copilot-status-ok-dot)]",
  warn: "bg-[var(--copilot-status-warn-dot)]",
  critical: "bg-[var(--copilot-status-critical-dot)]",
  loading: "bg-[var(--copilot-subtle)]",
} as const;

export const copilotCurrencyUyuClass = "text-[var(--copilot-currency-uyu)]";
export const copilotCurrencyUsdClass = "text-[var(--copilot-currency-usd)]";

export function copilotCurrencyClass(currency: "UYU" | "USD"): string {
  return currency === "UYU" ? copilotCurrencyUyuClass : copilotCurrencyUsdClass;
}
