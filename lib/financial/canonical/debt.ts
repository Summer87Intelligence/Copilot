/**
 * FINANCIAL CANONICAL LAYER — Deuda (stock) al corte.
 *
 * Regla canónica:
 *   pendingBalance = Σ(balance_amount > 0) de facturas activas no-NC con
 *                    `issue_date <= cutoff` (incluye arrastre pre-período).
 *   overdueBalance = subconjunto con `due_date < cutoff` (vencimiento real).
 *   currentBalance = pendingBalance − overdueBalance.
 *
 * `due_date` es la ÚNICA fuente de vencimiento. Nunca se usa `issue_date` como
 * sustituto. Facturas sin `due_date` resoluble no pueden marcarse vencidas y
 * caen en `currentBalance` (contabilizadas en `balanceWithoutDueDate`).
 */

import { getDaysLate } from "@/lib/copilot/operating-aging";

import { roundMoney } from "./currency";
import { classifyInvoice } from "./internal";
import type {
  CanonicalDebtMetrics,
  CanonicalFinancialContext,
  CanonicalInvoiceInput,
  FinancialCurrency,
} from "./types";

export function buildCanonicalDebtMetrics(
  invoices: readonly CanonicalInvoiceInput[],
  context: CanonicalFinancialContext,
  currency: FinancialCurrency
): CanonicalDebtMetrics {
  let pendingBalance = 0;
  let overdueBalance = 0;
  let balanceWithoutDueDate = 0;
  const openClients = new Set<string>();
  const overdueClients = new Set<string>();

  for (const inv of invoices) {
    const { normalized } = classifyInvoice(inv);
    if (normalized === null) continue;
    if (normalized.currency !== currency) continue;
    if (normalized.isCreditNote) continue; // las NC no son deuda abierta

    const { issueDate } = normalized;
    if (issueDate === null || issueDate < context.minFinancialDate) continue;
    if (issueDate > context.cutoffDate) continue; // aún no emitida al corte
    if (!(normalized.pending > 0)) continue;

    pendingBalance = roundMoney(pendingBalance + normalized.pending);
    if (normalized.companyId) openClients.add(normalized.companyId);

    if (normalized.dueDate === null) {
      balanceWithoutDueDate = roundMoney(balanceWithoutDueDate + normalized.pending);
      continue; // sin vencimiento resoluble → tratado como no vencido
    }

    const daysLate = getDaysLate(normalized.dueDate, context.cutoffDate);
    if (Number.isFinite(daysLate) && daysLate > 0) {
      overdueBalance = roundMoney(overdueBalance + normalized.pending);
      if (normalized.companyId) overdueClients.add(normalized.companyId);
    }
  }

  const currentBalance = roundMoney(Math.max(0, pendingBalance - overdueBalance));

  return {
    currency,
    pendingBalance,
    overdueBalance,
    currentBalance,
    overdueClients: overdueClients.size,
    totalOpenClients: openClients.size,
    balanceWithoutDueDate,
  };
}
