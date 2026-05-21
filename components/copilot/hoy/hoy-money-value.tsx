import type { MoneyAmount } from "@/lib/copilot-today-business-pulse";

export type MoneyTone = "neutral" | "positive" | "warning" | "danger" | "muted";

const TONE_CLASS: Record<MoneyTone, string> = {
  neutral: "font-semibold text-[var(--copilot-ink)]",
  positive: "font-semibold text-emerald-700",
  warning: "font-semibold text-amber-700",
  danger: "font-bold text-rose-700",
  muted: "text-sm text-[var(--copilot-ink-muted)]",
};

export function moneyToneClass(tone: MoneyTone): string {
  return `${TONE_CLASS[tone]} tabular-nums`;
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
