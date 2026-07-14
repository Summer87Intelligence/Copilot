/**
 * FINANCIAL CANONICAL LAYER — Resumen canónico único.
 *
 * `buildCanonicalFinancialSummary` es la API estable que los módulos deben
 * consumir a medida que migran. Devuelve, por moneda, las 4 familias de
 * métricas (ventas, cobranza registrada, deuda, aging) más los diagnósticos de
 * integridad (moneda desconocida, exclusión pre-2026).
 *
 * UYU y USD se calculan por separado; nunca se consolidan sin `exchangeRate`.
 */

import { buildCanonicalAgingMetrics } from "./aging";
import { buildCanonicalDebtMetrics } from "./debt";
import { buildCanonicalRegisteredCollectionsMetrics } from "./collections";
import { buildCanonicalSalesMetrics } from "./sales";
import { classifyInvoice, classifyReceipt, ymd } from "./internal";
import type {
  CanonicalCurrencyMetrics,
  CanonicalFinancialContext,
  CanonicalFinancialDiagnostics,
  CanonicalFinancialSummary,
  CanonicalInvoiceInput,
  CanonicalReceiptInput,
} from "./types";

export interface BuildCanonicalFinancialSummaryInput {
  context: CanonicalFinancialContext;
  invoices: readonly CanonicalInvoiceInput[];
  receipts?: readonly CanonicalReceiptInput[];
}

function computeDiagnostics(
  input: BuildCanonicalFinancialSummaryInput
): CanonicalFinancialDiagnostics {
  const { context, invoices, receipts = [] } = input;
  let excludedByMinFinancialDate = 0;
  let excludedReceiptsByMinFinancialDate = 0;
  let excludedByUnknownCurrency = 0;
  let excludedReceiptsByUnknownCurrency = 0;

  for (const inv of invoices) {
    const { normalized, unknownCurrency } = classifyInvoice(inv);
    if (unknownCurrency) {
      excludedByUnknownCurrency += 1;
      continue;
    }
    if (normalized === null) continue;
    if (normalized.issueDate !== null && normalized.issueDate < context.minFinancialDate) {
      excludedByMinFinancialDate += 1;
    }
  }

  for (const rec of receipts) {
    const { normalized, unknownCurrency } = classifyReceipt(rec);
    if (unknownCurrency) {
      excludedReceiptsByUnknownCurrency += 1;
      continue;
    }
    if (normalized === null) continue;
    const rDate = normalized.receiptDate ?? ymd(rec.receipt_date);
    if (rDate !== null && rDate < context.minFinancialDate) {
      excludedReceiptsByMinFinancialDate += 1;
    }
  }

  return {
    excludedByMinFinancialDate,
    excludedReceiptsByMinFinancialDate,
    excludedByUnknownCurrency,
    excludedReceiptsByUnknownCurrency,
  };
}

export function buildCanonicalFinancialSummary(
  input: BuildCanonicalFinancialSummaryInput
): CanonicalFinancialSummary {
  const { context, invoices, receipts = [] } = input;

  const byCurrency: CanonicalCurrencyMetrics[] = context.currencies.map((currency) => ({
    currency,
    sales: buildCanonicalSalesMetrics(invoices, context, currency),
    registeredCollections: buildCanonicalRegisteredCollectionsMetrics(
      receipts,
      context,
      currency
    ),
    debt: buildCanonicalDebtMetrics(invoices, context, currency),
    aging: buildCanonicalAgingMetrics(invoices, context, currency),
  }));

  return {
    context,
    byCurrency,
    diagnostics: computeDiagnostics(input),
  };
}
