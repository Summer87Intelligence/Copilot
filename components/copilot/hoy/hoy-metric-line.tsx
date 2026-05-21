import type { MoneyAmount } from "@/lib/copilot-today-business-pulse";

import { MoneyTone, MoneyValue } from "./hoy-money-value";

export function MetricLine({
  label,
  helper,
  amount,
  tone = "neutral",
  suffix,
  empty = "Sin dato del período",
}: {
  label: string;
  helper?: string;
  amount: MoneyAmount | null;
  tone?: MoneyTone;
  /** Ej. % cobranza junto al monto cobrado */
  suffix?: string | null;
  empty?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--copilot-ink)]">{label}</p>
        {helper ? (
          <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{helper}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-baseline gap-2 text-right">
        <MoneyValue amount={amount} tone={tone} empty={empty} />
        {suffix ? (
          <span
            className={`text-sm font-semibold tabular-nums ${
              tone === "positive" ? "text-emerald-600" : "text-[var(--copilot-ink-muted)]"
            }`}
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}
