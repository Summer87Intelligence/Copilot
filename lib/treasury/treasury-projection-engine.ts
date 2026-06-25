/**
 * Motor unificado de caja proyectada por moneda (Hoy / Tesorería / Finanzas).
 * Sin conversión UYU/USD. No resta templates recurrentes — solo instancias en planned_cash_obligations.
 */

import {
  expectedCashBalance30d,
  safeCashBalance30d,
} from "@/lib/treasury/treasury-cash-position";
import { isRecurringGeneratedObligation } from "@/lib/treasury/treasury-recurring-payments";
import {
  addDaysYmd,
  summarizeScheduledOutflows,
  type CoverageStatus,
  type TreasuryOutflowSummary,
} from "@/lib/treasury/treasury-scheduled-payments";
import { shouldCountManualCashInCashflow } from "@/lib/treasury/treasury-projection";
import { isTransferLegCounted } from "@/lib/treasury/treasury-projection";
import { signedManualCashAmount } from "@/lib/treasury/treasury-sign";
import type {
  ManualCashMovement,
  PlannedCashObligation,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

export type TreasuryProjectionIncludedItems = {
  obligationIds: string[];
  recurringObligationIds: string[];
  manualScheduledObligationIds: string[];
};

export type TreasuryProjectionCurrencyResult = {
  currency: TreasuryCurrencyCode;
  currentCash: number;
  /** Ingresos manuales con fecha > asOf y ≤ horizonte (informativo; puede estar ya en currentCash). */
  expectedIncome: number;
  /** Cobros esperados Cartera (escenario; 0 si no se pasa pending). */
  expectedCollections: number;
  /** Total egresos pendientes en horizonte (programados + recurrentes generados). */
  scheduledOutflows: number;
  /** Subconjunto de scheduledOutflows generado por regla recurrente. */
  recurringGeneratedOutflows: number;
  /** Subconjunto programado manual (no recurrente generado). */
  manualScheduledOutflows: number;
  /** Egresos manuales futuros en horizonte (informativo; puede estar ya en currentCash). */
  manualOutflows: number;
  /** Caja − egresos programados (sin cobros esperados). */
  projectedCash: number;
  /** Caja + cobros esperados − egresos programados. */
  projectedCashWithCollections: number;
  coverageStatus: CoverageStatus;
  missingAmount: number | null;
  hasConfiguredPayments: boolean;
  includedItems: TreasuryProjectionIncludedItems;
};

export type TreasuryProjectionHorizonResult = {
  asOfDate: string;
  horizonEndDate: string;
  byCurrency: TreasuryProjectionCurrencyResult[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function dedupeOutflowObligations(
  obligations: readonly PlannedCashObligation[]
): PlannedCashObligation[] {
  const byId = new Map<string, PlannedCashObligation>();
  for (const row of obligations) {
    if (row.direction !== "outflow" || !row.affectsCashflow) continue;
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

function paymentAmount(row: PlannedCashObligation): number {
  return row.amountFinal ?? row.amountEstimated;
}

function safeCoverageStatus(safeCash: number, scheduledPayments: number): CoverageStatus {
  if (scheduledPayments <= 0) return safeCash >= 0 ? "healthy" : "critical";
  if (safeCash < 0) return "critical";
  const ratio = scheduledPayments > 0 ? safeCash / scheduledPayments : 1;
  if (ratio < 0.15) return "attention";
  return "healthy";
}

function sumFutureManualFlows(
  movements: readonly ManualCashMovement[],
  currency: TreasuryCurrencyCode,
  asOfDate: string,
  horizonEndDate: string
): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const m of movements) {
    if (m.currencyCode !== currency) continue;
    if (m.movementDate <= asOfDate || m.movementDate > horizonEndDate) continue;
    if (!shouldCountManualCashInCashflow(m)) continue;
    if (!isTransferLegCounted(m, movements)) continue;
    const signed = signedManualCashAmount({
      movementType: m.movementType,
      amount: m.amount,
      metadata: m.metadata,
    });
    if (m.movementType === "income" && signed > 0) income += signed;
    if (m.movementType === "expense") expense += Math.abs(signed);
  }
  return { income: roundMoney(income), expense: roundMoney(expense) };
}

function breakdownFromObligations(
  obligations: readonly PlannedCashObligation[],
  currency: TreasuryCurrencyCode,
  summary: TreasuryOutflowSummary | undefined,
  asOfDate: string,
  horizonEndDate: string
): {
  scheduledOutflows: number;
  recurringGeneratedOutflows: number;
  manualScheduledOutflows: number;
  hasConfigured: boolean;
  includedItems: TreasuryProjectionIncludedItems;
} {
  const merged = dedupeOutflowObligations(obligations).filter(
    (row) => row.currencyCode === currency
  );

  const obligationIds: string[] = [];
  const recurringObligationIds: string[] = [];
  const manualScheduledObligationIds: string[] = [];
  let recurringTotal = 0;
  let manualTotal = 0;

  for (const row of merged) {
    if (row.dueDate > horizonEndDate) continue;
    const amt = paymentAmount(row);
    const rowSummary = summarizeScheduledOutflows([row], { asOfDate, horizonEndDate }).find(
      (s) => s.currency === currency
    );
    if ((rowSummary?.itemsCount ?? 0) === 0) continue;

    obligationIds.push(row.id);
    if (isRecurringGeneratedObligation(row)) {
      recurringObligationIds.push(row.id);
      recurringTotal += amt;
    } else {
      manualScheduledObligationIds.push(row.id);
      manualTotal += amt;
    }
  }

  const scheduledOutflows = roundMoney(summary?.scheduledTotal ?? recurringTotal + manualTotal);
  return {
    scheduledOutflows,
    recurringGeneratedOutflows: roundMoney(recurringTotal),
    manualScheduledOutflows: roundMoney(manualTotal),
    hasConfigured: (summary?.itemsCount ?? obligationIds.length) > 0,
    includedItems: {
      obligationIds,
      recurringObligationIds,
      manualScheduledObligationIds,
    },
  };
}

export function buildTreasuryProjectionHorizon(input: {
  asOfDate: string;
  horizonDays?: number;
  horizonEndDate?: string;
  cashByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
  obligations?: readonly PlannedCashObligation[];
  summaries?: readonly TreasuryOutflowSummary[];
  pendingReceivables?: Partial<Record<TreasuryCurrencyCode, number>>;
  manualMovements?: readonly ManualCashMovement[];
}): TreasuryProjectionHorizonResult {
  const horizonDays = input.horizonDays ?? 30;
  const horizonEndDate = input.horizonEndDate ?? addDaysYmd(input.asOfDate, horizonDays);
  const obligations = input.obligations ?? [];
  const summariesFromObligations =
    obligations.length > 0
      ? summarizeScheduledOutflows(dedupeOutflowObligations(obligations), {
          asOfDate: input.asOfDate,
          horizonEndDate,
        })
      : [];
  const summaries = input.summaries?.length ? input.summaries : summariesFromObligations;

  const byCurrency: TreasuryProjectionCurrencyResult[] = [];

  for (const currency of CURRENCIES) {
    const currentCash = roundMoney(input.cashByCurrency[currency] ?? 0);
    const pending = input.pendingReceivables?.[currency] ?? 0;
    const summary = summaries.find((s) => s.currency === currency);
    const currencyObligations = obligations.filter((o) => o.currencyCode === currency);

    const breakdown =
      currencyObligations.length > 0
        ? breakdownFromObligations(
            currencyObligations,
            currency,
            summary,
            input.asOfDate,
            horizonEndDate
          )
        : {
            scheduledOutflows: roundMoney(summary?.scheduledTotal ?? 0),
            recurringGeneratedOutflows: 0,
            manualScheduledOutflows: roundMoney(summary?.scheduledTotal ?? 0),
            hasConfigured: (summary?.itemsCount ?? 0) > 0,
            includedItems: {
              obligationIds: [] as string[],
              recurringObligationIds: [] as string[],
              manualScheduledObligationIds: [] as string[],
            },
          };

    if (currencyObligations.length > 0 && breakdown.recurringGeneratedOutflows > 0) {
      breakdown.manualScheduledOutflows = roundMoney(
        Math.max(0, breakdown.scheduledOutflows - breakdown.recurringGeneratedOutflows)
      );
    }

    const futureManual = sumFutureManualFlows(
      input.manualMovements ?? [],
      currency,
      input.asOfDate,
      horizonEndDate
    );

    const scheduled = breakdown.hasConfigured ? breakdown.scheduledOutflows : 0;
    const projectedCash = breakdown.hasConfigured
      ? safeCashBalance30d(currentCash, scheduled)
      : currentCash;
    const projectedCashWithCollections = breakdown.hasConfigured
      ? expectedCashBalance30d(currentCash, pending, scheduled)
      : roundMoney(currentCash + pending);

    const missingAmount = projectedCash < 0 ? roundMoney(Math.abs(projectedCash)) : null;

    const hasActivity =
      currentCash !== 0 ||
      pending > 0 ||
      breakdown.hasConfigured ||
      futureManual.income > 0 ||
      futureManual.expense > 0;
    if (!hasActivity) continue;

    byCurrency.push({
      currency,
      currentCash,
      expectedIncome: futureManual.income,
      expectedCollections: pending,
      scheduledOutflows: scheduled,
      recurringGeneratedOutflows: breakdown.recurringGeneratedOutflows,
      manualScheduledOutflows: breakdown.manualScheduledOutflows,
      manualOutflows: futureManual.expense,
      projectedCash,
      projectedCashWithCollections,
      coverageStatus: breakdown.hasConfigured
        ? safeCoverageStatus(projectedCash, scheduled)
        : "healthy",
      missingAmount,
      hasConfiguredPayments: breakdown.hasConfigured,
      includedItems: breakdown.includedItems,
    });
  }

  return { asOfDate: input.asOfDate, horizonEndDate, byCurrency };
}
