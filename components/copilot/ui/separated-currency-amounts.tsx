"use client";

import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import { buildSeparatedCurrencyValues } from "@/lib/ui/currency-amounts-model";

/**
 * SeparatedCurrencyAmounts (DS-Core) — importes multi-moneda apilados y
 * SIEMPRE separados. Reemplaza cualquier formato inline `$… · U$S…` en celdas,
 * footers y cards. En modo `usd_equivalent` colapsa a un único importe.
 */

export function SeparatedCurrencyAmounts({
  uyu,
  usd,
  mode,
  fxRate,
  align = "start",
  emptyText = "—",
  className = "",
}: {
  uyu: number;
  usd: number;
  mode: "native" | "usd_equivalent";
  fxRate: number;
  align?: "start" | "end";
  emptyText?: string;
  className?: string;
}) {
  const alignClass = align === "end" ? "items-end text-right" : "items-start text-left";

  if (mode === "usd_equivalent") {
    const hasAny = uyu > 0 || usd > 0;
    const total = convertToUsdEquivalent({ uyu, usd }, fxRate);
    return (
      <span className={`whitespace-nowrap tabular-nums ${className}`}>
        {hasAny ? formatUsdEquivalent(total) : emptyText}
      </span>
    );
  }

  const lines = buildSeparatedCurrencyValues(uyu, usd, formatMoneyCurrency);
  if (lines.length === 0) {
    return <span className={className}>{emptyText}</span>;
  }

  return (
    <span className={`flex flex-col leading-tight ${alignClass} ${className}`}>
      {lines.map((line) => (
        <span key={line.currency} className="block whitespace-nowrap tabular-nums">
          {line.formatted}
        </span>
      ))}
    </span>
  );
}
