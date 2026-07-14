/**
 * FINANCIAL CANONICAL LAYER — Deuda (stock) al corte.
 *
 * Regla canónica:
 *   pendingBalance = Σ(balance abierto) de unidades vencibles con
 *                    `issue_date <= cutoff` (incluye arrastre pre-período).
 *   overdueBalance = subconjunto con `due_date < cutoff` (vencimiento real).
 *   currentBalance = pendingBalance − overdueBalance.
 *
 * Deriva de `buildCanonicalDebtUnits` (fuente única). Sin cuotas, cada factura
 * abierta es una unidad — comportamiento idéntico a FASE 0. Con cuotas, usar
 * `buildCanonicalDebtMetricsFromUnits` directamente sobre las unidades.
 *
 * `due_date` es la ÚNICA fuente de vencimiento. Nunca `issue_date`.
 */

import { buildCanonicalDebtUnits } from "./debt-units";
import { buildCanonicalDebtMetricsFromUnits } from "./metrics-from-units";
import type {
  CanonicalDebtMetrics,
  CanonicalFinancialContext,
  CanonicalInvoiceInput,
  FinancialCurrency,
} from "./types";

export { buildCanonicalDebtMetricsFromUnits } from "./metrics-from-units";

export function buildCanonicalDebtMetrics(
  invoices: readonly CanonicalInvoiceInput[],
  context: CanonicalFinancialContext,
  currency: FinancialCurrency
): CanonicalDebtMetrics {
  const { units } = buildCanonicalDebtUnits({ invoices, context });
  return buildCanonicalDebtMetricsFromUnits(units, currency, context.cutoffDate);
}
