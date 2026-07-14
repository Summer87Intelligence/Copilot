/**
 * FINANCIAL CANONICAL LAYER — Aging (stock) por vencimiento.
 *
 * Distribuye el saldo abierto en los 5 buckets canónicos según los días de
 * atraso desde `due_date` hasta `cutoff`. Deriva de `buildCanonicalDebtUnits`
 * (fuente única) y reutiliza los umbrales de `operating-aging`.
 *
 * Universo idéntico a `buildCanonicalDebtMetrics`: por construcción,
 * `aging.total === debt.pendingBalance` para la misma moneda.
 */

import { buildCanonicalDebtUnits } from "./debt-units";
import { buildCanonicalAgingMetricsFromUnits } from "./metrics-from-units";
import type {
  CanonicalAgingMetrics,
  CanonicalFinancialContext,
  CanonicalInvoiceInput,
  FinancialCurrency,
} from "./types";

export { buildCanonicalAgingMetricsFromUnits } from "./metrics-from-units";

export function buildCanonicalAgingMetrics(
  invoices: readonly CanonicalInvoiceInput[],
  context: CanonicalFinancialContext,
  currency: FinancialCurrency
): CanonicalAgingMetrics {
  const { units } = buildCanonicalDebtUnits({ invoices, context });
  return buildCanonicalAgingMetricsFromUnits(units, currency, context.cutoffDate);
}
