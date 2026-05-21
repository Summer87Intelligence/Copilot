/**
 * Scopes de /copilot/hoy — separación Estado actual / Actividad período / Proyección 30d.
 *
 * Regla de producto: el período de análisis SOLO afecta `HoyPeriodActivity`.
 * Estado actual y proyección 30d no dependen del rango confirmado.
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import { buildCurrencyIndex } from "@/lib/copilot-cartera-cards-source";
import type { HoyPeriodRange } from "@/lib/copilot-hoy-period";
import type { CurrencyCode } from "@/lib/copilot-hoy-executive";
import type { HoyCashPositionBlock, HoyProjection30dBlock } from "@/lib/copilot-hoy-treasury";
import {
  sumManualExpenseInRange,
  sumManualIncomeInRange,
} from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

export type { HoyPeriodRange };

export type HoyCurrentScope = {
  asOfDate: string;
  cashAvailableByCurrency: CarteraCurrencyTotals;
  currentReceivablesByCurrency: CarteraCurrencyTotals;
  overdue30ByCurrency: CarteraCurrencyTotals;
  agingCurrentByCurrency: CarteraCurrencyTotals;
  debtorClientsByCurrency: CarteraCurrencyTotals;
  totalDebtorClients: number;
};

export type HoyPeriodActivity = {
  range: HoyPeriodRange;
  billedNetByCurrency: CarteraCurrencyTotals;
  collectedInPeriodByCurrency: CarteraCurrencyTotals;
  creditNoteAmountByCurrency: CarteraCurrencyTotals;
  manualIncomeByCurrency: CarteraCurrencyTotals;
  manualExpenseByCurrency: CarteraCurrencyTotals;
  operatingResultByCurrency: CarteraCurrencyTotals;
};

export type HoyProjection30dScope = {
  asOfDate: string;
  horizonEndDate: string;
  blocks: HoyProjection30dBlock[];
};

export type HoyCurrentStateBlock = {
  currency: CurrencyCode;
  cashAvailable: number;
  collectedAccumulated: number;
  manualIncome: number;
  manualExpense: number;
  pendingReceivables: number;
  overdue30: number;
  debtorClients: number;
};

export type HoyPeriodActivityBlock = {
  currency: CurrencyCode;
  billedNet: number;
  collectedInPeriod: number;
  creditNoteAmount: number;
  manualIncome: number;
  manualExpense: number;
  operatingResult: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyTotals(): CarteraCurrencyTotals {
  return { UYU: 0, USD: 0 };
}

/** Métricas de Cartera del período (`mode=period_only`) — cobrado = suma recibos en período. */
export function carteraPeriodActivityFromReport(currencies: unknown): {
  billedNet: CarteraCurrencyTotals;
  collectedInPeriod: CarteraCurrencyTotals;
  creditNoteAmount: CarteraCurrencyTotals;
} {
  const billedNet = emptyTotals();
  const collectedInPeriod = emptyTotals();
  const creditNoteAmount = emptyTotals();
  const index = buildCurrencyIndex(currencies);
  for (const code of ["UYU", "USD"] as const) {
    const m = index.get(code);
    if (!m) continue;
    billedNet[code] = round2(m.issuedInPeriodNet);
    collectedInPeriod[code] = round2(m.collectedInPeriod);
    creditNoteAmount[code] = round2(m.creditNoteAmount);
  }
  return { billedNet, collectedInPeriod, creditNoteAmount };
}

export function sumManualCashInPeriod(
  movements: readonly ManualCashMovement[],
  range: HoyPeriodRange
): { income: CarteraCurrencyTotals; expense: CarteraCurrencyTotals } {
  return {
    income: {
      UYU: sumManualIncomeInRange(movements, "UYU", range.from, range.to),
      USD: sumManualIncomeInRange(movements, "USD", range.from, range.to),
    },
    expense: {
      UYU: sumManualExpenseInRange(movements, "UYU", range.from, range.to),
      USD: sumManualExpenseInRange(movements, "USD", range.from, range.to),
    },
  };
}

/** resultadoOperativo = cobradoEnPeriodo + ingresosManuales - egresosManuales (por moneda). */
export function operatingResultByCurrency(p: {
  collectedInPeriod: CarteraCurrencyTotals;
  manualIncome: CarteraCurrencyTotals;
  manualExpense: CarteraCurrencyTotals;
}): CarteraCurrencyTotals {
  return {
    UYU: round2(p.collectedInPeriod.UYU + p.manualIncome.UYU - p.manualExpense.UYU),
    USD: round2(p.collectedInPeriod.USD + p.manualIncome.USD - p.manualExpense.USD),
  };
}

export function buildHoyPeriodActivity(
  range: HoyPeriodRange,
  periodReportCurrencies: unknown,
  manualMovements: readonly ManualCashMovement[]
): HoyPeriodActivity {
  const fromReport = carteraPeriodActivityFromReport(periodReportCurrencies);
  const manual = sumManualCashInPeriod(manualMovements, range);
  const operatingResultByCurrency_ = operatingResultByCurrency({
    collectedInPeriod: fromReport.collectedInPeriod,
    manualIncome: manual.income,
    manualExpense: manual.expense,
  });
  return {
    range,
    billedNetByCurrency: fromReport.billedNet,
    collectedInPeriodByCurrency: fromReport.collectedInPeriod,
    creditNoteAmountByCurrency: fromReport.creditNoteAmount,
    manualIncomeByCurrency: manual.income,
    manualExpenseByCurrency: manual.expense,
    operatingResultByCurrency: operatingResultByCurrency_,
  };
}

export function buildHoyCurrentScope(p: {
  asOfDate: string;
  portfolioPending: CarteraCurrencyTotals;
  agingOverdue30: CarteraCurrencyTotals;
  agingCurrent: CarteraCurrencyTotals;
  debtorCounts: CarteraCurrencyTotals;
  cashBlocks: readonly HoyCashPositionBlock[];
}): HoyCurrentScope {
  const cashAvailableByCurrency: CarteraCurrencyTotals = { UYU: 0, USD: 0 };
  for (const block of p.cashBlocks) {
    cashAvailableByCurrency[block.currency] = block.availableCash;
  }
  const totalDebtorClients =
    (p.debtorCounts.UYU ?? 0) + (p.debtorCounts.USD ?? 0);
  return {
    asOfDate: p.asOfDate,
    cashAvailableByCurrency,
    currentReceivablesByCurrency: { ...p.portfolioPending },
    overdue30ByCurrency: { ...p.agingOverdue30 },
    agingCurrentByCurrency: { ...p.agingCurrent },
    debtorClientsByCurrency: { ...p.debtorCounts },
    totalDebtorClients,
  };
}

export function buildHoyCurrentStateBlocks(
  cashBlocks: readonly HoyCashPositionBlock[],
  scope: HoyCurrentScope
): HoyCurrentStateBlock[] {
  const out: HoyCurrentStateBlock[] = [];
  for (const currency of ["UYU", "USD"] as const) {
    const cash = cashBlocks.find((b) => b.currency === currency);
    const hasActivity =
      (cash?.availableCash ?? 0) !== 0 ||
      (cash?.collectedFromClients ?? 0) > 0 ||
      (cash?.manualIncome ?? 0) > 0 ||
      (cash?.manualExpense ?? 0) > 0 ||
      cash?.lastMovement != null ||
      scope.currentReceivablesByCurrency[currency] > 0 ||
      scope.overdue30ByCurrency[currency] > 0 ||
      scope.debtorClientsByCurrency[currency] > 0;
    if (!hasActivity) continue;
    out.push({
      currency,
      cashAvailable: cash?.availableCash ?? 0,
      collectedAccumulated: cash?.collectedFromClients ?? 0,
      manualIncome: cash?.manualIncome ?? 0,
      manualExpense: cash?.manualExpense ?? 0,
      pendingReceivables: scope.currentReceivablesByCurrency[currency],
      overdue30: scope.overdue30ByCurrency[currency],
      debtorClients: scope.debtorClientsByCurrency[currency],
    });
  }
  return out;
}

export function buildHoyPeriodActivityBlocks(activity: HoyPeriodActivity): HoyPeriodActivityBlock[] {
  const blocks: HoyPeriodActivityBlock[] = [];
  for (const currency of ["UYU", "USD"] as const) {
    const billedNet = activity.billedNetByCurrency[currency];
    const collectedInPeriod = activity.collectedInPeriodByCurrency[currency];
    const creditNoteAmount = activity.creditNoteAmountByCurrency[currency];
    const manualIncome = activity.manualIncomeByCurrency[currency];
    const manualExpense = activity.manualExpenseByCurrency[currency];
    const operatingResult = activity.operatingResultByCurrency[currency];
    const hasActivity =
      billedNet > 0 ||
      collectedInPeriod > 0 ||
      creditNoteAmount > 0 ||
      manualIncome > 0 ||
      manualExpense > 0;
    if (!hasActivity) continue;
    blocks.push({
      currency,
      billedNet,
      collectedInPeriod,
      creditNoteAmount,
      manualIncome,
      manualExpense,
      operatingResult,
    });
  }
  return blocks;
}
