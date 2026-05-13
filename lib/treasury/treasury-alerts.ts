import { daysUntilDue, effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { signedPlannedObligationAmount } from "@/lib/treasury/treasury-sign";
import type {
  BankReconciliationMovement,
  PlannedCashObligation,
  TreasuryAlert,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export type TreasuryAlertThresholds = {
  criticalOutflowAmount: number;
  bankUnmatchedAmount: number;
};

const DEFAULT_THRESHOLDS: TreasuryAlertThresholds = {
  criticalOutflowAmount: 50_000,
  bankUnmatchedAmount: 10_000,
};

export function evaluateTreasuryAlerts(params: {
  asOfDate: string;
  obligations: readonly PlannedCashObligation[];
  bankMovements: readonly BankReconciliationMovement[];
  thresholds?: Partial<TreasuryAlertThresholds>;
}): TreasuryAlert[] {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...params.thresholds };
  const alerts: TreasuryAlert[] = [];

  for (const o of params.obligations) {
    const effective = effectivePlannedObligationStatus(o.status, o.dueDate, params.asOfDate);
    if (effective === "paid" || effective === "cancelled") continue;
    const days = daysUntilDue(o.dueDate, params.asOfDate);
    if (days == null) continue;

    const amount = o.amountFinal ?? o.amountEstimated;
    if (effective === "overdue" || days < 0) {
      alerts.push({
        kind: "obligation_overdue",
        severity: o.priority === "critical" ? "critical" : "warning",
        message: `Obligación vencida: ${o.title}`,
        recordId: o.id,
        currencyCode: o.currencyCode,
        amount,
        dueDate: o.dueDate,
      });
      continue;
    }
    if (days === 1) {
      alerts.push({
        kind: "obligation_due_1d",
        severity: "warning",
        message: `Obligación vence mañana: ${o.title}`,
        recordId: o.id,
        currencyCode: o.currencyCode,
        amount,
        dueDate: o.dueDate,
      });
    } else if (days <= 3) {
      alerts.push({
        kind: "obligation_due_3d",
        severity: "info",
        message: `Obligación vence en ${days} días: ${o.title}`,
        recordId: o.id,
        currencyCode: o.currencyCode,
        amount,
        dueDate: o.dueDate,
      });
    } else if (days <= 7) {
      alerts.push({
        kind: "obligation_due_7d",
        severity: "info",
        message: `Obligación vence en ${days} días: ${o.title}`,
        recordId: o.id,
        currencyCode: o.currencyCode,
        amount,
        dueDate: o.dueDate,
      });
    }

    if (
      o.direction === "outflow" &&
      o.priority === "critical" &&
      amount >= thresholds.criticalOutflowAmount
    ) {
      alerts.push({
        kind: "critical_outflow_threshold",
        severity: "critical",
        message: `Egreso crítico proyectado: ${o.title}`,
        recordId: o.id,
        currencyCode: o.currencyCode,
        amount,
        dueDate: o.dueDate,
      });
    }
  }

  for (const b of params.bankMovements) {
    if (b.matchStatus === "matched" || b.matchStatus === "ignored") continue;
    if (b.amount < thresholds.bankUnmatchedAmount) continue;
    alerts.push({
      kind: "bank_unmatched_threshold",
      severity: "warning",
      message: `Movimiento bancario sin conciliar: ${b.description}`,
      recordId: b.id,
      currencyCode: b.currencyCode,
      amount: b.amount,
      dueDate: b.movementDate,
    });
  }

  return alerts;
}

export function sumAlertsByCurrency(
  alerts: readonly TreasuryAlert[]
): Partial<Record<TreasuryCurrencyCode, number>> {
  const out: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const a of alerts) {
    out[a.currencyCode] = (out[a.currencyCode] ?? 0) + a.amount;
  }
  return out;
}

export function obligationAlertAmount(obligation: PlannedCashObligation): number {
  const amount = obligation.amountFinal ?? obligation.amountEstimated;
  return signedPlannedObligationAmount(obligation.direction, amount);
}
