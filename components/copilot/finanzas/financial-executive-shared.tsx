"use client";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import {
  financialCardToneClass,
  metricValueClass,
  subtleLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";

export function fmtMoney(n: number, currency: "UYU" | "USD" | null): string {
  return formatMoneyCurrency(n, currency, { compact: n >= 100_000 });
}

export function fmtDelta(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}%`;
}

export function ExecutiveMetricCard({
  label,
  value,
  subcopy,
  delta,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string;
  subcopy: string;
  delta?: string | null;
  tone?: "positive" | "warning" | "danger" | "neutral";
  onClick?: () => void;
}) {
  const cardClass = `rounded-2xl border ${financialCardToneClass(tone)} p-4 shadow-sm transition hover:shadow-md`;
  const inner = (
    <>
      <p className={subtleLabelClass}>{label}</p>
      <p className={`mt-2 ${metricValueClass} text-2xl`}>{value}</p>
      {delta ? (
        <p className="mt-1 text-[11px] font-semibold tabular-nums text-[var(--copilot-ink-muted)]">
          {delta} vs período anterior
        </p>
      ) : null}
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">{subcopy}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`w-full text-left ${cardClass}`}>
        {inner}
      </button>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}
