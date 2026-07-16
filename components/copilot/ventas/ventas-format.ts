/**
 * FASE 9 — Helpers de formato del módulo Ventas (client-side).
 * UYU y USD SIEMPRE separados: nunca se combinan en una sola línea.
 */

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import type { MetricCurrencyValue } from "@/lib/ui/financial-metric-card-model";
import type { CurrencyPair } from "@/lib/sales/canonical/types";

export function formatUyu(n: number): string {
  return formatMoneyCurrency(n, "UYU");
}

export function formatUsd(n: number): string {
  return formatMoneyCurrency(n, "USD");
}

/** Convierte un CurrencyPair en valores apilados (UYU primero) para FinancialMetricCard. */
export function pairToMetricValues(pair: CurrencyPair): MetricCurrencyValue[] {
  return [
    { currency: "UYU", formatted: formatUyu(pair.UYU) },
    { currency: "USD", formatted: formatUsd(pair.USD) },
  ];
}

/** Formatea una variación porcentual; null → "Sin base comparable". */
export function formatPct(pct: number | null): string {
  if (pct === null) return "Sin base comparable";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`;
}

export function formatQuantity(n: number): string {
  return n.toLocaleString("es-UY", { maximumFractionDigits: 2 });
}

export function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

/** Tono para una variación (positivo=verde, negativo=rojo, 0/neutro=neutral). */
export function deltaTone(n: number): "positive" | "danger" | "neutral" {
  if (n > 0) return "positive";
  if (n < 0) return "danger";
  return "neutral";
}

export function formatDateShort(ymd: string | null): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y.slice(2)}`;
}
