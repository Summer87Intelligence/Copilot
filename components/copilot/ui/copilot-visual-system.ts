export type CopilotVisualTone = "positive" | "warning" | "danger" | "neutral";

export const premiumCardClass =
  "rounded-2xl border shadow-sm bg-white";

export const positiveFinancialCardClass =
  "bg-gradient-to-br from-white to-emerald-50/60 border-emerald-100";

export const warningFinancialCardClass =
  "bg-gradient-to-br from-white to-amber-50/60 border-amber-100";

export const dangerFinancialCardClass =
  "bg-gradient-to-br from-white to-rose-50/60 border-rose-100";

export const neutralFinancialCardClass =
  "bg-gradient-to-br from-white to-slate-50/60 border-slate-200";

export const softCalloutClass =
  "rounded-xl border border-[var(--copilot-border)]/70 bg-white/70 px-3 py-2";

export const actionCardClass =
  "rounded-2xl border border-[var(--copilot-border)] bg-gradient-to-br from-white to-slate-50/40 shadow-sm";

export const metricValueClass =
  "font-semibold tabular-nums tracking-tight text-[var(--copilot-ink)]";

export const subtleLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]";

export const statusBadgeVariants = {
  stable: "border-emerald-200 bg-emerald-50 text-emerald-800",
  attention: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-rose-200 bg-rose-50 text-rose-800",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
} as const;

export function financialCardToneClass(tone: CopilotVisualTone): string {
  if (tone === "positive") return positiveFinancialCardClass;
  if (tone === "warning") return warningFinancialCardClass;
  if (tone === "danger") return dangerFinancialCardClass;
  return neutralFinancialCardClass;
}

