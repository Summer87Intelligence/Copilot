/**
 * Estado canónico para /copilot/finanzas — misma fuente operativa que Hoy/Tesorería/Cartera.
 *
 * Todas las fórmulas delegan en funciones ya auditadas:
 *   availableCash     → buildHoyCashPositionBlocks (treasury-cash-position)
 *   pendingReceivables → resolveCanonicalActiveDebt (financial-reconciliation)
 *   overdueReceivables → resolveCanonicalOverdueDebt (portfolio)
 *   scheduledPayments  → buildHoyProjection30dBlocks (planned-cash-obligations)
 *   safeCash30d        → currentCash − scheduledPayments
 *   expectedCash30d    → currentCash + pendingReceivables − scheduledPayments
 *
 * Nunca suma UYU + USD. Sin lógica financiera propia.
 */

import {
  buildHoyCashPositionBlocks,
  buildHoyProjection30dBlocks,
} from "@/lib/copilot-hoy-treasury";
import {
  resolveCanonicalActiveDebt,
  resolveCanonicalOverdueDebt,
} from "@/lib/financial/canonical-debt-metrics";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

export type FinanzasCanonicalCurrencyState = {
  currency: "UYU" | "USD";
  availableCash: number;
  pendingReceivables: number;
  overdueReceivables: number;
  scheduledPayments30d: number;
  /** availableCash − scheduledPayments30d */
  safeCash30d: number;
  /** availableCash + pendingReceivables − scheduledPayments30d */
  expectedCash30d: number;
  hasConfiguredPayments: boolean;
};

export function buildFinanzasCanonicalState(p: {
  cashPositions: readonly CashPositionByCurrency[];
  treasurySummaries: readonly TreasuryOutflowSummary[];
  /** Prioriza reconciliación; fallback a portfolioRows si no disponible. */
  outstandingReportCurrencies?: unknown;
  portfolioRows?: readonly {
    debt_uyu?: number;
    debt_usd?: number;
    overdue_uyu?: number;
    overdue_usd?: number;
  }[];
}): FinanzasCanonicalCurrencyState[] {
  const pending = resolveCanonicalActiveDebt({
    outstandingReportCurrencies: p.outstandingReportCurrencies,
    portfolioRows: p.portfolioRows,
  });

  const overdue = resolveCanonicalOverdueDebt({
    portfolioRows: p.portfolioRows,
  });

  const cashBlocks = buildHoyCashPositionBlocks({
    cashPositions: p.cashPositions,
    pendingByCurrency: pending,
    treasurySummaries: p.treasurySummaries,
  });

  const projectionBlocks = buildHoyProjection30dBlocks({
    cashPositionBlocks: cashBlocks,
    pendingByCurrency: pending,
    treasurySummaries: p.treasurySummaries,
  });

  return projectionBlocks.map((block) => ({
    currency: block.currency,
    availableCash: block.currentCash,
    pendingReceivables: block.pendingReceivables,
    overdueReceivables: overdue[block.currency] ?? 0,
    scheduledPayments30d: block.scheduledPayments,
    safeCash30d: block.safeCash30d,
    expectedCash30d: block.expectedCash30d,
    hasConfiguredPayments: block.hasConfiguredPayments,
  }));
}
