import { isPlannedObligationPendingForCashflow } from "@/lib/treasury/treasury-obligation-status";
import {
  signedBankMovementAmount,
  signedManualCashAmount,
  signedPlannedObligationAmount,
} from "@/lib/treasury/treasury-sign";
import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
  TreasuryCurrencyCode,
  TreasuryProjectionCurrencyBucket,
  TreasuryProjectionSnapshot,
} from "@/lib/treasury/treasury-types";
import { readTransferPairId } from "@/lib/treasury/treasury-validation";

export function shouldCountManualCashInCashflow(movement: ManualCashMovement): boolean {
  if (movement.status !== "active") return false;
  if (!movement.affectsCashflow) return false;
  if (movement.movementType === "transfer") return false;
  if (movement.reconciled && movement.bankReconciliationId) return false;
  return true;
}

export function shouldCountBankInCashflow(
  movement: BankReconciliationMovement,
  manualMovements: readonly ManualCashMovement[]
): boolean {
  if (movement.matchStatus === "ignored") return false;
  if (movement.matchStatus === "matched" && movement.matchedSource === "manual_cash") {
    const linked = manualMovements.some(
      (m) => m.bankReconciliationId === movement.id && m.reconciled
    );
    if (linked) return false;
  }
  return true;
}

export function isTransferLegCounted(
  movement: ManualCashMovement,
  all: readonly ManualCashMovement[]
): boolean {
  if (movement.movementType !== "transfer") return true;
  const pairId = readTransferPairId(movement.metadata);
  if (!pairId) return false;
  const legs = all.filter(
    (m) =>
      m.movementType === "transfer" &&
      readTransferPairId(m.metadata) === pairId &&
      m.status === "active"
  );
  if (legs.length < 2) return false;
  const sorted = [...legs].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[0]?.id === movement.id;
}

export function getManualCashImpact(
  movements: readonly ManualCashMovement[]
): Partial<Record<TreasuryCurrencyCode, number>> {
  const out: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const m of movements) {
    if (!shouldCountManualCashInCashflow(m)) continue;
    if (!isTransferLegCounted(m, movements)) continue;
    const signed = signedManualCashAmount({
      movementType: m.movementType,
      amount: m.amount,
      metadata: m.metadata,
    });
    out[m.currencyCode] = (out[m.currencyCode] ?? 0) + signed;
  }
  return out;
}

export function getBankReconciliationSummary(
  bankMovements: readonly BankReconciliationMovement[],
  manualMovements: readonly ManualCashMovement[] = []
): Partial<Record<TreasuryCurrencyCode, { net: number; unmatched: number; matched: number }>> {
  const out: Partial<
    Record<TreasuryCurrencyCode, { net: number; unmatched: number; matched: number }>
  > = {};
  for (const b of bankMovements) {
    if (!shouldCountBankInCashflow(b, manualMovements)) continue;
    const signed = signedBankMovementAmount(b.movementType, b.amount);
    const bucket = out[b.currencyCode] ?? { net: 0, unmatched: 0, matched: 0 };
    bucket.net += signed;
    if (b.matchStatus === "unmatched" || b.matchStatus === "partial") {
      bucket.unmatched += Math.abs(signed);
    } else if (b.matchStatus === "matched") {
      bucket.matched += Math.abs(signed);
    }
    out[b.currencyCode] = bucket;
  }
  return out;
}

export function getUpcomingObligations(
  obligations: readonly PlannedCashObligation[],
  asOfDate: string,
  withinDays: number
): Partial<Record<TreasuryCurrencyCode, number>> {
  const out: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const o of obligations) {
    if (!isPlannedObligationPendingForCashflow(o, asOfDate)) continue;
    const dueMs = Date.parse(`${o.dueDate}T12:00:00.000Z`);
    const asOfMs = Date.parse(`${asOfDate}T12:00:00.000Z`);
    if (!Number.isFinite(dueMs) || !Number.isFinite(asOfMs)) continue;
    const days = Math.round((dueMs - asOfMs) / 86_400_000);
    if (days < 0 || days > withinDays) continue;
    const amount = o.amountFinal ?? o.amountEstimated;
    const signed = signedPlannedObligationAmount(o.direction, amount);
    out[o.currencyCode] = (out[o.currencyCode] ?? 0) + signed;
  }
  return out;
}

export function getTreasuryProjection(params: {
  asOfDate: string;
  manualMovements: readonly ManualCashMovement[];
  bankMovements: readonly BankReconciliationMovement[];
  obligations: readonly PlannedCashObligation[];
  obligationHorizonDays?: number;
}): TreasuryProjectionSnapshot {
  const horizon = params.obligationHorizonDays ?? 30;
  const manual = getManualCashImpact(params.manualMovements);
  const bankSummary = getBankReconciliationSummary(
    params.bankMovements,
    params.manualMovements
  );
  const obligationFlow = getUpcomingObligations(
    params.obligations,
    params.asOfDate,
    horizon
  );

  const currencies = new Set<TreasuryCurrencyCode>([
    ...(Object.keys(manual) as TreasuryCurrencyCode[]),
    ...(Object.keys(bankSummary) as TreasuryCurrencyCode[]),
    ...(Object.keys(obligationFlow) as TreasuryCurrencyCode[]),
  ]);

  const buckets: TreasuryProjectionCurrencyBucket[] = [];
  for (const currencyCode of currencies) {
    const manualNet = manual[currencyCode] ?? 0;
    const bankNet = bankSummary[currencyCode]?.net ?? 0;
    const obligationSigned = obligationFlow[currencyCode] ?? 0;
    const obligationOutflow = obligationSigned < 0 ? Math.abs(obligationSigned) : 0;
    const obligationInflow = obligationSigned > 0 ? obligationSigned : 0;
    buckets.push({
      currencyCode,
      manualNet,
      bankNet,
      obligationOutflow,
      obligationInflow,
      projectedNet: manualNet + bankNet + obligationSigned,
    });
  }

  buckets.sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  return { asOfDate: params.asOfDate, buckets };
}
