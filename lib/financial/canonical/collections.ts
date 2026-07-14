/**
 * FINANCIAL CANONICAL LAYER — Cobranza registrada del período.
 *
 * Regla canónica:
 *   registeredCollections = Σ(proto_receipts.amount) con `receipt_date` en
 *                           `[periodStart, periodEnd]`, recibos activos no anulados.
 *
 * Ancla temporal: `receipt_date`. Puede incluir cobros de facturas emitidas en
 * períodos anteriores. Excluye pre-`minFinancialDate`.
 */

import { roundMoney } from "./currency";
import { classifyReceipt, withinPeriod } from "./internal";
import type {
  CanonicalFinancialContext,
  CanonicalReceiptInput,
  CanonicalRegisteredCollectionsMetrics,
  FinancialCurrency,
} from "./types";

export function buildCanonicalRegisteredCollectionsMetrics(
  receipts: readonly CanonicalReceiptInput[],
  context: CanonicalFinancialContext,
  currency: FinancialCurrency
): CanonicalRegisteredCollectionsMetrics {
  let registeredCollections = 0;
  let receiptCount = 0;

  for (const rec of receipts) {
    const { normalized } = classifyReceipt(rec);
    if (normalized === null) continue;
    if (normalized.currency !== currency) continue;

    const { receiptDate } = normalized;
    if (receiptDate === null || receiptDate < context.minFinancialDate) continue;
    if (!withinPeriod(receiptDate, context.periodStart, context.periodEnd)) continue;

    registeredCollections = roundMoney(registeredCollections + normalized.amount);
    receiptCount += 1;
  }

  return { currency, registeredCollections, receiptCount };
}
