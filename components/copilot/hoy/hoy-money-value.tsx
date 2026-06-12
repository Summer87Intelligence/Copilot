import type { MoneyAmount } from "@/lib/copilot-today-business-pulse";
import { copilotCurrencyClass } from "@/components/copilot/ui/copilot-visual-system";

export type MoneyTone = "neutral" | "positive" | "warning" | "danger" | "muted";

const TONE_CLASS: Record<MoneyTone, string> = {
  neutral: "font-semibold text-[var(--copilot-ink)]",
  positive: "font-semibold text-[var(--copilot-success-text)]",
  warning: "font-semibold text-[var(--copilot-warning-text)]",
  danger: "font-bold text-[var(--copilot-danger-text)]",
  muted: "text-sm text-[var(--copilot-ink-muted)]",
};

export function moneyToneClass(tone: MoneyTone): string {
  return `${TONE_CLASS[tone]} tabular-nums`;
}

/** Monto con color por moneda; vencida usa danger para prioridad visual. */
export function moneyCurrencyClass(
  currency: "UYU" | "USD",
  options?: { overdue?: boolean }
): string {
  if (options?.overdue) {
    return "font-bold tabular-nums text-[var(--copilot-danger-text)]";
  }
  return `font-semibold tabular-nums ${copilotCurrencyClass(currency)}`;
}

export function MoneyValue({
  amount,
  tone = "neutral",
  empty = "—",
  className = "",
}: {
  amount: MoneyAmount | null;
  tone?: MoneyTone;
  empty?: string;
  className?: string;
}) {
  if (!amount) {
    return <span className={`text-sm text-[var(--copilot-ink-muted)] ${className}`}>{empty}</span>;
  }
  return (
    <span className={`text-base ${moneyToneClass(tone)} ${className}`}>{amount.formatted}</span>
  );
}
