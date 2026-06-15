import { isRecurringGeneratedObligation } from "@/lib/treasury/treasury-recurring-payments";
import { buildTreasuryProjectionHorizon } from "@/lib/treasury/treasury-projection-engine";
import {
  addDaysYmd,
  summarizeScheduledOutflows,
  type TreasuryOutflowSummary,
} from "@/lib/treasury/treasury-scheduled-payments";
import type {
  PlannedCashObligation,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

export type TreasuryProjectedCashSnapshot = {
  summaries: TreasuryOutflowSummary[];
  overdueTotals: Partial<Record<TreasuryCurrencyCode, number>>;
  upcoming30Totals: Partial<Record<TreasuryCurrencyCode, number>>;
  committedTotals: Partial<Record<TreasuryCurrencyCode, number>>;
  afterCommitments: Partial<Record<TreasuryCurrencyCode, number>>;
  recurringItemsInHorizon: number;
};

function dedupeOutflowObligations(
  ...groups: readonly (readonly PlannedCashObligation[])[]
): PlannedCashObligation[] {
  const byId = new Map<string, PlannedCashObligation>();
  for (const group of groups) {
    for (const row of group) {
      if (row.direction !== "outflow" || !row.affectsCashflow) continue;
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

/**
 * Caja proyectada Tesorería (30 días):
 * caja disponible − egresos pendientes con vencimiento ≤ asOf + 30d.
 * Incluye pagos programados manuales e instancias generadas por recurrentes activos.
 */
export function buildTreasuryProjectedCashSnapshot(p: {
  obligations: readonly PlannedCashObligation[];
  overdue: readonly PlannedCashObligation[];
  upcoming30: readonly PlannedCashObligation[];
  cashByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
  asOfDate: string;
  horizonDays?: number;
}): TreasuryProjectedCashSnapshot {
  const horizonDays = p.horizonDays ?? 30;
  const horizonEnd = addDaysYmd(p.asOfDate, horizonDays);
  const merged = dedupeOutflowObligations(p.obligations, p.overdue, p.upcoming30);
  const summaries = summarizeScheduledOutflows(merged, {
    asOfDate: p.asOfDate,
    horizonEndDate: horizonEnd,
  });
  const horizon = buildTreasuryProjectionHorizon({
    asOfDate: p.asOfDate,
    horizonEndDate: horizonEnd,
    cashByCurrency: p.cashByCurrency,
    obligations: merged,
    summaries,
  });

  const overdueTotals: Partial<Record<TreasuryCurrencyCode, number>> = {};
  const upcoming30Totals: Partial<Record<TreasuryCurrencyCode, number>> = {};
  const committedTotals: Partial<Record<TreasuryCurrencyCode, number>> = {};
  const afterCommitments: Partial<Record<TreasuryCurrencyCode, number>> = {};

  for (const summary of summaries) {
    overdueTotals[summary.currency] = summary.overdue;
    const nonOverdueUpcoming = Math.max(0, summary.next30Days - summary.overdue);
    upcoming30Totals[summary.currency] = nonOverdueUpcoming;
    committedTotals[summary.currency] = summary.next30Days;
  }

  for (const row of horizon.byCurrency) {
    afterCommitments[row.currency] = row.projectedCash;
    if (committedTotals[row.currency] == null) {
      committedTotals[row.currency] = row.scheduledOutflows;
    }
    if (overdueTotals[row.currency] == null) {
      overdueTotals[row.currency] = 0;
    }
    if (upcoming30Totals[row.currency] == null) {
      upcoming30Totals[row.currency] = row.scheduledOutflows;
    }
  }

  for (const currency of CURRENCIES) {
    if (afterCommitments[currency] != null) continue;
    afterCommitments[currency] = p.cashByCurrency[currency] ?? 0;
    committedTotals[currency] = 0;
    overdueTotals[currency] = 0;
    upcoming30Totals[currency] = 0;
  }

  const recurringItemsInHorizon = merged.filter(
    (row) =>
      isRecurringGeneratedObligation(row) &&
      row.dueDate <= horizonEnd
  ).length;

  return {
    summaries,
    overdueTotals,
    upcoming30Totals,
    committedTotals,
    afterCommitments,
    recurringItemsInHorizon,
  };
}
