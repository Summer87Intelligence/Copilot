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
};

export type CashPositionByCurrency = {
  currency: TreasuryCurrencyCode;
  openingConfigured: boolean;
  openingBalance: number;
  manualIncome: number;
  manualExpense: number;
  adjustments: number;
  transfersNet: number;
  currentCash: number;
  movementsCount: number;
  lastMovement: { date: string; concept: string } | null;
  /** Egresos manuales en rango (solo si se pide en el servicio). */
  manualExpenseInRange?: number;
};

export type CalculateCashPositionInput = {
  manualCashMovements: readonly ManualCashMovement[];
  openingBalances?: readonly CashOpeningBalanceInput[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function openingMap(
  balances: readonly CashOpeningBalanceInput[] | undefined
): Partial<Record<TreasuryCurrencyCode, number>> {
  const out: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const row of balances ?? []) {
    if (row.currency !== "UYU" && row.currency !== "USD") continue;
    if (!Number.isFinite(row.amount) || row.amount < 0) continue;
    out[row.currency] = roundMoney(row.amount);
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
  const openings = openingMap(input.openingBalances);
  const currencies: TreasuryCurrencyCode[] = ["UYU", "USD"];
  const movements = input.manualCashMovements;

  return currencies.map((currency) => {
    const openingConfigured = openings[currency] != null;
    const openingBalance = openings[currency] ?? 0;

    let manualIncome = 0;
    let manualExpense = 0;
    let adjustments = 0;
    let transfersNet = 0;
    let movementsCount = 0;
    let lastMovement: { date: string; concept: string } | null = null;

    for (const m of movements) {
      if (m.currencyCode !== currency) continue;
      if (!shouldCountManualCashInCashflow(m)) continue;
      if (!isTransferLegCounted(m, movements)) continue;

      const signed = signedManualCashAmount({
        movementType: m.movementType,
        amount: m.amount,
        metadata: m.metadata,
      });
      movementsCount += 1;

      if (
        !lastMovement ||
        m.movementDate > lastMovement.date ||
        (m.movementDate === lastMovement.date && m.concept > lastMovement.concept)
      ) {
        lastMovement = { date: m.movementDate, concept: m.concept };
      }

      switch (m.movementType) {
        case "income":
          manualIncome += signed;
          break;
        case "expense":
          manualExpense += Math.abs(signed);
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

    const currentCash = roundMoney(
      openingBalance + manualIncome - manualExpense + adjustments + transfersNet
    );

    return {
      currency,
      openingConfigured,
      openingBalance,
      manualIncome,
      manualExpense,
      adjustments,
      transfersNet,
      currentCash,
      movementsCount,
      lastMovement,
    };
  });
}

/** Caja proyectada 30d = caja actual + por cobrar − pagos futuros (misma moneda). */
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

export function projectedCashBalance30d(
  currentCash: number,
  pendingReceivables: number,
  scheduledOutflows30d: number
): number {
  return roundMoney(currentCash + pendingReceivables - scheduledOutflows30d);
}
