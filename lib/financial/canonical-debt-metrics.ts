/**
 * Rollup canónico de deuda activa / vencida — fuente única para Hoy, Cartera y Dashboard.
 *
 * deuda_activa   → SUM(balance_amount > 0) vía `pendingAtCutoff` (reconciliación all_outstanding)
 * deuda_vencida  → portfolio overdue (due_date < hoy) o aging Cartera como fallback
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import {
  sumCarteraAgingOverdue,
  sumPortfolioOverdueDebt,
} from "@/lib/copilot-cartera-aging-totals";
import { buildCurrencyIndex } from "@/lib/copilot-cartera-cards-source";
import type {
  AgingBucket,
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";

export const CANONICAL_DEBT_TOLERANCE = 0.01;

export type CanonicalDebtRollup = {
  active: CarteraCurrencyTotals;
  overdue: CarteraCurrencyTotals;
};

export function roundCanonicalDebt(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deuda activa total por moneda desde `report.currencies` (pendingAtCutoff). */
export function canonicalActiveDebtFromReportCurrencies(currencies: unknown): CarteraCurrencyTotals {
  const out: CarteraCurrencyTotals = { UYU: 0, USD: 0 };
  const index = buildCurrencyIndex(currencies);
  for (const code of ["UYU", "USD"] as const) {
    const m = index.get(code);
    if (m) out[code] = roundCanonicalDebt(m.pendingAtCutoff);
  }
  return out;
}

export function canonicalActiveDebtFromReport(
  report: Pick<FinancialConsistencyReport, "currencies">
): CarteraCurrencyTotals {
  return canonicalActiveDebtFromReportCurrencies(report.currencies);
}

/** Deuda vencida (>30d aging) — métrica Cartera legacy / Vencido >30 días. */
export function canonicalOverdueDebtFromReport(
  report: Pick<FinancialConsistencyReport, "agingByCurrency">
): CarteraCurrencyTotals {
  return sumCarteraAgingOverdue(report.agingByCurrency ?? {});
}

/** Deuda vencida total (due_date < hoy). Prioriza portfolio; fallback aging 31+. */
export function resolveCanonicalOverdueDebt(input: {
  portfolioRows?: readonly { overdue_uyu?: number; overdue_usd?: number }[];
  agingByCurrency?: Partial<Record<ReconciliationCurrencyCode, AgingBucket[]>>;
}): CarteraCurrencyTotals {
  if (input.portfolioRows && input.portfolioRows.length > 0) {
    return sumPortfolioOverdueDebt(input.portfolioRows);
  }
  return sumCarteraAgingOverdue(input.agingByCurrency ?? {});
}

export function canonicalDebtRollupFromReport(
  report: Pick<FinancialConsistencyReport, "currencies" | "agingByCurrency">,
  portfolioRows?: readonly { overdue_uyu?: number; overdue_usd?: number }[]
): CanonicalDebtRollup {
  return {
    active: canonicalActiveDebtFromReport(report),
    overdue: resolveCanonicalOverdueDebt({
      portfolioRows,
      agingByCurrency: report.agingByCurrency,
    }),
  };
}

/** Suma filas del explorador (`staleClients.pendingByCurrency`). */
export function canonicalActiveDebtFromStaleClients(
  report: Pick<FinancialConsistencyReport, "staleClients">
): CarteraCurrencyTotals {
  let uyu = 0;
  let usd = 0;
  for (const client of report.staleClients ?? []) {
    uyu += client.pendingByCurrency?.UYU ?? 0;
    usd += client.pendingByCurrency?.USD ?? 0;
  }
  return { UYU: roundCanonicalDebt(uyu), USD: roundCanonicalDebt(usd) };
}

/** Fallback legacy: suma `debt_uyu` / `debt_usd` del portfolio hub. */
export function sumPortfolioRowActiveDebt(
  rows: readonly { debt_uyu?: number; debt_usd?: number }[]
): CarteraCurrencyTotals {
  return {
    UYU: roundCanonicalDebt(rows.reduce((s, r) => s + (r.debt_uyu ?? 0), 0)),
    USD: roundCanonicalDebt(rows.reduce((s, r) => s + (r.debt_usd ?? 0), 0)),
  };
}

/**
 * Prioriza rollup canónico (reconciliación). Si no hay reporte, usa filas portfolio.
 */
export function resolveCanonicalActiveDebt(input: {
  outstandingReportCurrencies?: unknown;
  portfolioRows?: readonly { debt_uyu?: number; debt_usd?: number }[];
}): CarteraCurrencyTotals {
  if (input.outstandingReportCurrencies != null) {
    return canonicalActiveDebtFromReportCurrencies(input.outstandingReportCurrencies);
  }
  return sumPortfolioRowActiveDebt(input.portfolioRows ?? []);
}

export function canonicalDebtRoughlyEqual(
  a: CarteraCurrencyTotals,
  b: CarteraCurrencyTotals,
  tolerance = CANONICAL_DEBT_TOLERANCE
): boolean {
  return (
    Math.abs(a.UYU - b.UYU) <= tolerance && Math.abs(a.USD - b.USD) <= tolerance
  );
}

export function canonicalDebtDelta(
  a: CarteraCurrencyTotals,
  b: CarteraCurrencyTotals
): CarteraCurrencyTotals {
  return {
    UYU: roundCanonicalDebt(a.UYU - b.UYU),
    USD: roundCanonicalDebt(a.USD - b.USD),
  };
}
