import { isPlannedObligationPendingForCashflow } from "@/lib/treasury/treasury-obligation-status";
import {
  shouldCountBankInCashflow,
  shouldCountManualCashInCashflow,
} from "@/lib/treasury/treasury-projection";
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
} from "@/lib/treasury/treasury-types";

export const TREASURY_PROJECTION_WINDOWS = [7, 15, 30, 60] as const;
export type TreasuryProjectionWindow = (typeof TREASURY_PROJECTION_WINDOWS)[number];

export type TreasuryZetaCollectionInflow = {
  collectionDate: string;
  amount: number;
  currencyCode: TreasuryCurrencyCode;
};

export type TreasuryProjectionSnapshot = {
  date: string;
  projectedCashUyu: number;
  projectedCashUsd: number;
  inflowsUyu: number;
  outflowsUyu: number;
  inflowsUsd: number;
  outflowsUsd: number;
};

export type TreasuryProjectionRiskLevel = "healthy" | "warning" | "critical";

export type TreasuryCashProjectionResult = {
  snapshots: TreasuryProjectionSnapshot[];
  runwayDays: number | null;
  riskLevel: TreasuryProjectionRiskLevel;
};

export type TreasuryOpeningBalances = Partial<Record<TreasuryCurrencyCode, number>>;

type DailyFlow = {
  inflowsUyu: number;
  outflowsUyu: number;
  inflowsUsd: number;
  outflowsUsd: number;
};

function addDaysYmd(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return ymd;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyDailyFlow(): DailyFlow {
  return { inflowsUyu: 0, outflowsUyu: 0, inflowsUsd: 0, outflowsUsd: 0 };
}

function applySignedAmount(
  flow: DailyFlow,
  currencyCode: TreasuryCurrencyCode,
  signed: number
): void {
  if (currencyCode === "UYU") {
    if (signed >= 0) flow.inflowsUyu += signed;
    else flow.outflowsUyu += Math.abs(signed);
    return;
  }
  if (signed >= 0) flow.inflowsUsd += signed;
  else flow.outflowsUsd += Math.abs(signed);
}

function obligationFlowDate(obligation: PlannedCashObligation): string {
  return obligation.expectedPaymentDate ?? obligation.dueDate;
}

function isObligationCounted(obligation: PlannedCashObligation, asOfDate: string): boolean {
  if (!isPlannedObligationPendingForCashflow(obligation, asOfDate)) return false;
  const status = obligation.status;
  return status === "confirmed" || status === "planned" || status === "overdue";
}

function buildDailyFlows(params: {
  asOfDate: string;
  horizonDays: number;
  manualMovements: readonly ManualCashMovement[];
  bankMovements: readonly BankReconciliationMovement[];
  obligations: readonly PlannedCashObligation[];
  zetaCollections: readonly TreasuryZetaCollectionInflow[];
}): Map<string, DailyFlow> {
  const endDate = addDaysYmd(params.asOfDate, params.horizonDays);
  const flows = new Map<string, DailyFlow>();

  const ensure = (date: string): DailyFlow => {
    const existing = flows.get(date);
    if (existing) return existing;
    const created = emptyDailyFlow();
    flows.set(date, created);
    return created;
  };

  for (const movement of params.manualMovements) {
    if (!shouldCountManualCashInCashflow(movement)) continue;
    if (movement.movementDate < params.asOfDate || movement.movementDate > endDate) continue;
    const signed = signedManualCashAmount({
      movementType: movement.movementType,
      amount: movement.amount,
      metadata: movement.metadata,
    });
    applySignedAmount(ensure(movement.movementDate), movement.currencyCode, signed);
  }

  for (const movement of params.bankMovements) {
    if (!shouldCountBankInCashflow(movement, params.manualMovements)) continue;
    if (movement.movementDate < params.asOfDate || movement.movementDate > endDate) continue;
    const signed = signedBankMovementAmount(movement.movementType, movement.amount);
    applySignedAmount(ensure(movement.movementDate), movement.currencyCode, signed);
  }

  for (const obligation of params.obligations) {
    if (!isObligationCounted(obligation, params.asOfDate)) continue;
    const flowDate = obligationFlowDate(obligation);
    if (flowDate < params.asOfDate || flowDate > endDate) continue;
    const amount = obligation.amountFinal ?? obligation.amountEstimated;
    const signed = signedPlannedObligationAmount(obligation.direction, amount);
    applySignedAmount(ensure(flowDate), obligation.currencyCode, signed);
  }

  for (const collection of params.zetaCollections) {
    if (collection.collectionDate < params.asOfDate || collection.collectionDate > endDate) continue;
    if (collection.amount <= 0) continue;
    applySignedAmount(ensure(collection.collectionDate), collection.currencyCode, collection.amount);
  }

  return flows;
}

export function calculateRunway(
  snapshots: readonly TreasuryProjectionSnapshot[],
  asOfDate: string
): number | null {
  if (snapshots.length === 0) return null;

  const asOfMs = Date.parse(`${asOfDate}T12:00:00.000Z`);
  let earliest: number | null = null;

  for (const snapshot of snapshots) {
    if (snapshot.projectedCashUyu >= 0 && snapshot.projectedCashUsd >= 0) continue;
    const dayMs = Date.parse(`${snapshot.date}T12:00:00.000Z`);
    if (!Number.isFinite(dayMs) || !Number.isFinite(asOfMs)) continue;
    const days = Math.max(0, Math.round((dayMs - asOfMs) / 86_400_000));
    earliest = earliest == null ? days : Math.min(earliest, days);
  }

  if (earliest != null) return earliest;

  const last = snapshots[snapshots.length - 1];
  const lastMs = Date.parse(`${last.date}T12:00:00.000Z`);
  if (!Number.isFinite(lastMs) || !Number.isFinite(asOfMs)) return null;
  return Math.max(0, Math.round((lastMs - asOfMs) / 86_400_000));
}

export function calculateProjectionRisk(params: {
  runwayDays: number | null;
  snapshots: readonly TreasuryProjectionSnapshot[];
}): TreasuryProjectionRiskLevel {
  const hasNegative = params.snapshots.some(
    (snapshot) => snapshot.projectedCashUyu < 0 || snapshot.projectedCashUsd < 0
  );
  if (hasNegative) return "critical";
  if (params.runwayDays != null && params.runwayDays < 7) return "critical";
  if (params.runwayDays != null && params.runwayDays < 15) return "warning";
  return "healthy";
}

export function buildTreasuryProjection(params: {
  asOfDate: string;
  horizonDays: TreasuryProjectionWindow;
  openingBalances: TreasuryOpeningBalances;
  manualMovements: readonly ManualCashMovement[];
  bankMovements: readonly BankReconciliationMovement[];
  obligations: readonly PlannedCashObligation[];
  zetaCollections?: readonly TreasuryZetaCollectionInflow[];
}): TreasuryCashProjectionResult {
  const flows = buildDailyFlows({
    asOfDate: params.asOfDate,
    horizonDays: params.horizonDays,
    manualMovements: params.manualMovements,
    bankMovements: params.bankMovements,
    obligations: params.obligations,
    zetaCollections: params.zetaCollections ?? [],
  });

  let cashUyu = params.openingBalances.UYU ?? 0;
  let cashUsd = params.openingBalances.USD ?? 0;
  const snapshots: TreasuryProjectionSnapshot[] = [];

  for (let day = 0; day <= params.horizonDays; day += 1) {
    const date = addDaysYmd(params.asOfDate, day);
    const flow = flows.get(date) ?? emptyDailyFlow();
    cashUyu = roundMoney(cashUyu + flow.inflowsUyu - flow.outflowsUyu);
    cashUsd = roundMoney(cashUsd + flow.inflowsUsd - flow.outflowsUsd);
    snapshots.push({
      date,
      projectedCashUyu: cashUyu,
      projectedCashUsd: cashUsd,
      inflowsUyu: roundMoney(flow.inflowsUyu),
      outflowsUyu: roundMoney(flow.outflowsUyu),
      inflowsUsd: roundMoney(flow.inflowsUsd),
      outflowsUsd: roundMoney(flow.outflowsUsd),
    });
  }

  const runwayDays = calculateRunway(snapshots, params.asOfDate);
  const riskLevel = calculateProjectionRisk({ runwayDays, snapshots });
  return { snapshots, runwayDays, riskLevel };
}

export function deriveOpeningBalancesFromManualCash(
  manualMovements: readonly ManualCashMovement[]
): TreasuryOpeningBalances {
  const out: TreasuryOpeningBalances = {};
  for (const movement of manualMovements) {
    if (!shouldCountManualCashInCashflow(movement)) continue;
    const signed = signedManualCashAmount({
      movementType: movement.movementType,
      amount: movement.amount,
      metadata: movement.metadata,
    });
    out[movement.currencyCode] = roundMoney((out[movement.currencyCode] ?? 0) + signed);
  }
  return out;
}
