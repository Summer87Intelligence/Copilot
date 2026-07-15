import type {
  MetricCurrencyValue,
  MetricTone,
} from "@/lib/ui/financial-metric-card-model";

/**
 * Lógica pura de las KPI cards de Cobranza sobre DS-Core.
 *
 * Regla S4: cada moneda es un `MetricCurrencyValue` independiente; NUNCA se
 * concatenan UYU y USD en un mismo string (`$… · U$S…`). El componente sólo
 * apila estos valores; la separación está garantizada aquí por construcción.
 */

/** Formatea un monto para una moneda (prefijo simple, sin decimales de más). */
export type MoneyFormatter = (amount: number, currency: "UYU" | "USD") => string;

/**
 * Devuelve un valor por cada moneda con saldo (> 0), UYU primero.
 * Sin saldo en ninguna → arreglo vacío (el card muestra `emptyText`).
 */
export function buildCobranzaMoneyValues(
  uyu: number,
  usd: number,
  format: MoneyFormatter
): MetricCurrencyValue[] {
  const out: MetricCurrencyValue[] = [];
  if (uyu > 0) out.push({ currency: "UYU", formatted: format(uyu, "UYU") });
  if (usd > 0) out.push({ currency: "USD", formatted: format(usd, "USD") });
  return out;
}

/** Tono del cumplimiento de promesas (0–100, null = sin promesas cerradas). */
export function fulfillmentTone(rate: number | null): MetricTone {
  if (rate == null) return "neutral";
  if (rate < 40) return "danger";
  if (rate < 70) return "warning";
  return "neutral";
}

/** Tono del ratio de contactados; advierte bajo el 50 %. */
export function contactedTone(contacted: number, withDebt: number): MetricTone {
  if (withDebt <= 0) return "neutral";
  return contacted / withDebt < 0.5 ? "warning" : "neutral";
}
