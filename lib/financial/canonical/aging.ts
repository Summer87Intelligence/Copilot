/**
 * FINANCIAL CANONICAL LAYER — Aging (stock) por vencimiento.
 *
 * Distribuye el saldo abierto (`balance_amount`) en los 5 buckets canónicos
 * según los DÍAS DE ATRASO desde `due_date` hasta `cutoff`.
 *
 * Reutiliza `classifyOperatingDelay` (`lib/copilot/operating-aging.ts`), la
 * fuente única de los umbrales operativos (1–7 / 8–14 / 15–30 / +30).
 *
 * Universo de facturas idéntico a `buildCanonicalDebtMetrics`: por construcción,
 * `aging.total === debt.pendingBalance` para la misma moneda.
 */

import { classifyOperatingDelay } from "@/lib/copilot/operating-aging";

import { roundMoney } from "./currency";
import { classifyInvoice } from "./internal";
import type {
  CanonicalAgingMetrics,
  CanonicalFinancialContext,
  CanonicalInvoiceInput,
  FinancialCurrency,
} from "./types";

export function buildCanonicalAgingMetrics(
  invoices: readonly CanonicalInvoiceInput[],
  context: CanonicalFinancialContext,
  currency: FinancialCurrency
): CanonicalAgingMetrics {
  let current = 0;
  let overdue1To7 = 0;
  let overdue8To14 = 0;
  let overdue15To30 = 0;
  let overdue31Plus = 0;

  for (const inv of invoices) {
    const { normalized } = classifyInvoice(inv);
    if (normalized === null) continue;
    if (normalized.currency !== currency) continue;
    if (normalized.isCreditNote) continue;

    const { issueDate } = normalized;
    if (issueDate === null || issueDate < context.minFinancialDate) continue;
    if (issueDate > context.cutoffDate) continue;
    if (!(normalized.pending > 0)) continue;

    // Sin vencimiento resoluble → al día (mismo criterio que debt).
    if (normalized.dueDate === null) {
      current = roundMoney(current + normalized.pending);
      continue;
    }

    const { bucket } = classifyOperatingDelay(normalized.dueDate, context.cutoffDate);
    switch (bucket) {
      case "late_1_7":
        overdue1To7 = roundMoney(overdue1To7 + normalized.pending);
        break;
      case "late_8_14":
        overdue8To14 = roundMoney(overdue8To14 + normalized.pending);
        break;
      case "late_15_30":
        overdue15To30 = roundMoney(overdue15To30 + normalized.pending);
        break;
      case "late_30_plus":
        overdue31Plus = roundMoney(overdue31Plus + normalized.pending);
        break;
      case "on_time":
      default:
        current = roundMoney(current + normalized.pending);
        break;
    }
  }

  const total = roundMoney(
    current + overdue1To7 + overdue8To14 + overdue15To30 + overdue31Plus
  );

  return {
    currency,
    current,
    overdue1To7,
    overdue8To14,
    overdue15To30,
    overdue31Plus,
    total,
  };
}
