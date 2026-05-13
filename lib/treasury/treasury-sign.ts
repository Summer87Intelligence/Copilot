import {
  ADJUSTMENT_DIRECTIONS,
  type AdjustmentDirection,
  type BankMovementType,
  type ManualCashMovementType,
  type PlannedObligationDirection,
} from "@/lib/treasury/treasury-types";
import { readAdjustmentDirection } from "@/lib/treasury/treasury-validation";

function parsePositiveAmount(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export type ManualCashMovementSignInput = {
  movementType: ManualCashMovementType;
  amount: number;
  adjustmentDirection?: AdjustmentDirection | null;
  metadata?: Record<string, unknown> | null;
};

export function signedManualCashAmount(input: ManualCashMovementSignInput): number {
  const amount = parsePositiveAmount(input.amount);
  if (amount == null) return 0;
  switch (input.movementType) {
    case "income":
      return amount;
    case "expense":
      return -amount;
    case "adjustment": {
      const dir =
        input.adjustmentDirection ?? readAdjustmentDirection(input.metadata ?? null);
      if (dir === "increase") return amount;
      if (dir === "decrease") return -amount;
      return 0;
    }
    case "transfer":
      return 0;
    default:
      return 0;
  }
}

export function signedBankMovementAmount(
  movementType: BankMovementType,
  amount: number
): number {
  const n = parsePositiveAmount(amount);
  if (n == null) return 0;
  return movementType === "credit" ? n : -n;
}

export function signedPlannedObligationAmount(
  direction: PlannedObligationDirection,
  amount: number
): number {
  const n = parsePositiveAmount(amount);
  if (n == null) return 0;
  return direction === "inflow" ? n : -n;
}

export function isValidAdjustmentDirection(value: string): value is AdjustmentDirection {
  return (ADJUSTMENT_DIRECTIONS as readonly string[]).includes(value);
}
