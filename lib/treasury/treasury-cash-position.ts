/**
 * Caja actual por moneda — movimientos manuales confirmados (active) + saldo inicial.
 * No incluye pagos futuros ni conversión UYU/USD.
 */

import {
  isTransferLegCounted,
  shouldCountManualCashInCashflow,
} from "@/lib/treasury/treasury-projection";
import { signedManualCashAmount } from "@/lib/treasury/treasury-sign";
import type {
  ManualCashMovement,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export type CashOpeningBalanceInput = {
  currency: TreasuryCurrencyCode;
  amount: number;
  /** YYYY-MM-DD. When set, only movements on or after this date count toward cash. */
  effectiveDate?: string;
};

/** Cobrado por clientes acumulado (suma de recibos; en Hoy vía `carteraCollectedToDateFromReport`). */
export type CollectedFromClientsInput = {
  currency: TreasuryCurrencyCode;
  amount: number;
};

export type CashPositionByCurrency = {
  currency: TreasuryCurrencyCode;
  openingConfigured: boolean;
  openingBalance: number;
  /**
   * YYYY-MM-DD date used as baseline. Only movements on or after this date are
   * counted. Null (or absent) when no opening balance is configured.
   */
  baselineDate?: string | null;
  /** Cobros de clientes (Zeta/Cartera), opcional — default 0. */
  collectedFromClients: number;
  manualIncome: number;
  manualExpense: number;
  adjustments: number;
  transfersNet: number;
  /** Caja disponible estimada (antes `currentCash`). */
  availableCash: number;
  /** @deprecated Usar `availableCash`. */
  currentCash: number;
  movementsCount: number;
  /** @deprecated Usar `lastIncome` / `lastExpense`. */
  lastMovement: { date: string; concept: string } | null;
  /** Último ingreso manual registrado (movementType=income). */
  lastIncome: { date: string; concept: string } | null;
  /** Último egreso manual registrado (movementType=expense). */
  lastExpense: { date: string; concept: string } | null;
  manualExpenseInRange?: number;
};

export type CalculateCashPositionInput = {
  manualCashMovements: readonly ManualCashMovement[];
  openingBalances?: readonly CashOpeningBalanceInput[];
  collectedFromClients?: readonly CollectedFromClientsInput[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function amountMapByCurrency(
  rows: readonly { currency: TreasuryCurrencyCode; amount: number }[] | undefined
): Partial<Record<TreasuryCurrencyCode, number>> {
  const out: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const row of rows ?? []) {
    if (row.currency !== "UYU" && row.currency !== "USD") continue;
    if (!Number.isFinite(row.amount) || row.amount < 0) continue;
    out[row.currency] = roundMoney(row.amount);
  }
  return out;
}

function baselineDateMapByCurrency(
  rows: readonly CashOpeningBalanceInput[] | undefined
): Partial<Record<TreasuryCurrencyCode, string>> {
  const out: Partial<Record<TreasuryCurrencyCode, string>> = {};
  for (const row of rows ?? []) {
    if (row.currency !== "UYU" && row.currency !== "USD") continue;
    if (row.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(row.effectiveDate)) {
      out[row.currency] = row.effectiveDate;
    }
  }
  return out;
}

/** Movimiento individual afecta caja actual (para UI). */
export function manualMovementAffectsCurrentCash(
  movement: ManualCashMovement,
  allMovements?: readonly ManualCashMovement[]
): boolean {
  if (!shouldCountManualCashInCashflow(movement)) return false;
  const pool = allMovements ?? [movement];
  if (movement.movementType === "transfer") {
    return isTransferLegCounted(movement, pool);
  }
  return true;
}

export function calculateCashPosition(
  input: CalculateCashPositionInput
): CashPositionByCurrency[] {
  const openings = amountMapByCurrency(input.openingBalances);
  const baselines = baselineDateMapByCurrency(input.openingBalances);
  const collectedMap = amountMapByCurrency(input.collectedFromClients);
  const currencies: TreasuryCurrencyCode[] = ["UYU", "USD"];
  const movements = input.manualCashMovements;

  return currencies.map((currency) => {
    const openingConfigured = openings[currency] != null;
    const openingBalance = openings[currency] ?? 0;
    const baselineDate = baselines[currency] ?? null;
    const collectedFromClients = collectedMap[currency] ?? 0;

    let manualIncome = 0;
    let manualExpense = 0;
    let adjustments = 0;
    let transfersNet = 0;
    let movementsCount = 0;
    let lastMovement: { date: string; concept: string } | null = null;
    let lastIncome: { date: string; concept: string } | null = null;
    let lastExpense: { date: string; concept: string } | null = null;

    const considerEvent = (
      current: { date: string; concept: string } | null,
      date: string,
      concept: string
    ): { date: string; concept: string } => {
      if (
        !current ||
        date > current.date ||
        (date === current.date && concept > current.concept)
      ) {
        return { date, concept };
      }
      return current;
    };

    for (const m of movements) {
      if (m.currencyCode !== currency) continue;
      if (!shouldCountManualCashInCashflow(m)) continue;
      if (!isTransferLegCounted(m, movements)) continue;
      // When a baseline date is configured, only count movements on or after it.
      // Movements before the baseline are already baked into the loaded cash balance.
      if (baselineDate && m.movementDate < baselineDate) continue;

      const signed = signedManualCashAmount({
        movementType: m.movementType,
        amount: m.amount,
        metadata: m.metadata,
      });
      movementsCount += 1;

      lastMovement = considerEvent(lastMovement, m.movementDate, m.concept);

      switch (m.movementType) {
        case "income":
          manualIncome += signed;
          lastIncome = considerEvent(lastIncome, m.movementDate, m.concept);
          break;
        case "expense":
          manualExpense += Math.abs(signed);
          lastExpense = considerEvent(lastExpense, m.movementDate, m.concept);
          break;
        case "adjustment":
          adjustments += signed;
          break;
        case "transfer":
          transfersNet += signed;
          break;
        default:
          break;
      }
    }

    manualIncome = roundMoney(manualIncome);
    manualExpense = roundMoney(manualExpense);
    adjustments = roundMoney(adjustments);
    transfersNet = roundMoney(transfersNet);

    const availableCash = roundMoney(
      openingBalance +
        collectedFromClients +
        manualIncome -
        manualExpense +
        adjustments +
        transfersNet
    );

    return {
      currency,
      openingConfigured,
      openingBalance,
      baselineDate,
      collectedFromClients,
      manualIncome,
      manualExpense,
      adjustments,
      transfersNet,
      availableCash,
      currentCash: availableCash,
      movementsCount,
      lastMovement,
      lastIncome,
      lastExpense,
    };
  });
}

export function mergeCashIncomeEvents(
  manual: { date: string; concept: string } | null | undefined,
  zeta: { date: string; concept: string } | null | undefined
): { date: string; concept: string } | null {
  if (!manual && !zeta) return null;
  if (!manual) return zeta ?? null;
  if (!zeta) return manual;
  if (zeta.date > manual.date) return zeta;
  if (zeta.date < manual.date) return manual;
  return zeta.concept.localeCompare(manual.concept) > 0 ? zeta : manual;
}

/** Caja proyectada 30d = caja actual + por cobrar − pagos futuros (misma moneda). */
/** Suma ingresos manuales que afectan caja en [fromDate, toDate]. */
export function sumManualIncomeInRange(
  movements: readonly ManualCashMovement[],
  currency: TreasuryCurrencyCode,
  fromDate: string,
  toDate: string
): number {
  let total = 0;
  for (const m of movements) {
    if (m.currencyCode !== currency) continue;
    if (m.movementDate < fromDate || m.movementDate > toDate) continue;
    if (!shouldCountManualCashInCashflow(m)) continue;
    if (!isTransferLegCounted(m, movements)) continue;
    if (m.movementType !== "income") continue;
    total += m.amount;
  }
  return roundMoney(total);
}

/** Suma egresos manuales que afectan caja en [fromDate, toDate]. */
export function sumManualExpenseInRange(
  movements: readonly ManualCashMovement[],
  currency: TreasuryCurrencyCode,
  fromDate: string,
  toDate: string
): number {
  let total = 0;
  for (const m of movements) {
    if (m.currencyCode !== currency) continue;
    if (m.movementDate < fromDate || m.movementDate > toDate) continue;
    if (!shouldCountManualCashInCashflow(m)) continue;
    if (!isTransferLegCounted(m, movements)) continue;
    if (m.movementType !== "expense") continue;
    total += m.amount;
  }
  return roundMoney(total);
}

/** Fusiona cobrado de Cartera en posiciones ya calculadas (manual + saldo inicial). */
export function mergeCollectedIntoCashPositions(
  positions: readonly CashPositionByCurrency[],
  collectedByCurrency: Partial<Record<TreasuryCurrencyCode, number>>
): CashPositionByCurrency[] {
  return positions.map((p) => {
    const collectedFromClients = roundMoney(collectedByCurrency[p.currency] ?? 0);
    const availableCash = roundMoney(
      p.openingBalance +
        collectedFromClients +
        p.manualIncome -
        p.manualExpense +
        p.adjustments +
        p.transfersNet
    );
    return {
      ...p,
      collectedFromClients,
      availableCash,
      currentCash: availableCash,
    };
  });
}

/** Caja segura 30d = caja actual − pagos programados (sin deuda pendiente). */
export function safeCashBalance30d(
  availableCash: number,
  scheduledOutflows30d: number
): number {
  return roundMoney(availableCash - scheduledOutflows30d);
}

/** Caja esperada 30d = caja actual + por cobrar − pagos programados. */
export function expectedCashBalance30d(
  availableCash: number,
  pendingReceivables: number,
  scheduledOutflows30d: number
): number {
  return roundMoney(availableCash + pendingReceivables - scheduledOutflows30d);
}

/** @deprecated Usar `expectedCashBalance30d`. */
export function projectedCashBalance30d(
  availableCash: number,
  pendingReceivables: number,
  scheduledOutflows30d: number
): number {
  return expectedCashBalance30d(availableCash, pendingReceivables, scheduledOutflows30d);
}
