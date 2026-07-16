/**
 * FINANCIAL CANONICAL LAYER — Ventas del período.
 *
 * Regla canónica:
 *   issuedNet        = Σ(facturas activas emitidas en período) − Σ(notas de crédito del período)
 *   pendingAtCutoff  = Σ(balance_amount > 0) de ESAS ventas al corte
 *   appliedCollected = max(0, issuedNet − pendingAtCutoff)   ("cobrado aplicado")
 *
 * Ancla temporal: `issue_date`. Excluye pre-`minFinancialDate`.
 *
 * `appliedCollected` NO son recibos ingresados en el período. Para cobranza por
 * `receipt_date` ver `buildCanonicalRegisteredCollectionsMetrics`.
 */

import { roundMoney } from "./currency";
import { classifyInvoice, withinPeriod } from "./internal";
import type {
  CanonicalFinancialContext,
  CanonicalInvoiceInput,
  CanonicalSalesMetrics,
  FinancialCurrency,
} from "./types";

export function buildCanonicalSalesMetrics(
  invoices: readonly CanonicalInvoiceInput[],
  context: CanonicalFinancialContext,
  currency: FinancialCurrency
): CanonicalSalesMetrics {
  let issuedGross = 0;
  let creditNoteAmount = 0;
  let creditNoteCount = 0;
  let pendingAtCutoff = 0;
  let invoiceCount = 0;

  for (const inv of invoices) {
    const { normalized } = classifyInvoice(inv);
    if (normalized === null) continue;
    if (normalized.currency !== currency) continue;

    const { issueDate } = normalized;
    // Piso duro 2026 + rango del período (ancla issue_date).
    if (issueDate === null || issueDate < context.minFinancialDate) continue;
    if (!withinPeriod(issueDate, context.periodStart, context.periodEnd)) continue;

    if (normalized.isCreditNote) {
      creditNoteAmount = roundMoney(creditNoteAmount + normalized.total);
      creditNoteCount += 1;
      continue;
    }

    issuedGross = roundMoney(issuedGross + normalized.total);
    invoiceCount += 1;
    if (normalized.pending > 0) {
      pendingAtCutoff = roundMoney(pendingAtCutoff + normalized.pending);
    }
  }

  const issuedNet = roundMoney(issuedGross - creditNoteAmount);
  const appliedCollected = roundMoney(Math.max(0, issuedNet - pendingAtCutoff));
  const collectionRate =
    issuedNet > 0
      ? Math.max(0, Math.min(1, appliedCollected / issuedNet))
      : null;
  const averageTicket = invoiceCount > 0 ? roundMoney(issuedNet / invoiceCount) : null;

  return {
    currency,
    issuedNet,
    appliedCollected,
    pendingAtCutoff,
    collectionRate,
    invoiceCount,
    averageTicket,
    creditNoteCount,
    creditNoteAmount,
  };
}
