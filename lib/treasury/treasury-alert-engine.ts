import { daysUntilDue, effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import {
  getManualCashImpact,
  shouldCountBankInCashflow,
  shouldCountManualCashInCashflow,
} from "@/lib/treasury/treasury-projection";
import { signedBankMovementAmount, signedManualCashAmount } from "@/lib/treasury/treasury-sign";
import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";
import type { TreasuryCashProjectionResult } from "@/lib/treasury/treasury-cash-projection";

export type TreasuryAlertSeverity = "info" | "warning" | "critical";

export type TreasuryAlertType =
  | "upcoming_obligation"
  | "overdue_obligation"
  | "projected_negative_cash"
  | "low_cash_runway"
  | "unreconciled_bank_movements"
  | "unusual_expense"
  | "high_upcoming_outflow"
  | "bank_balance_mismatch";

export type TreasuryAlert = {
  id: string;
  type: TreasuryAlertType;
  severity: TreasuryAlertSeverity;
  title: string;
  description: string;
  recommendation?: string;
  metadata?: Record<string, unknown>;
};

export type TreasuryAlertEngineThresholds = {
  unreconciledBankDays: number;
  upcomingOutflowShare: number;
  unusualExpenseMultiplier: number;
  runwayWarningDays: number;
  runwayCriticalDays: number;
};

const DEFAULT_THRESHOLDS: TreasuryAlertEngineThresholds = {
  unreconciledBankDays: 7,
  upcomingOutflowShare: 0.35,
  unusualExpenseMultiplier: 1.5,
  runwayWarningDays: 15,
  runwayCriticalDays: 7,
};

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

function addDaysYmd(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return ymd;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function obligationAmount(obligation: PlannedCashObligation): number {
  return obligation.amountFinal ?? obligation.amountEstimated;
}

function isOpenObligation(obligation: PlannedCashObligation, asOfDate: string): boolean {
  const effective = effectivePlannedObligationStatus(
    obligation.status,
    obligation.dueDate,
    asOfDate
  );
  return effective !== "paid" && effective !== "cancelled";
}

export function buildUpcomingObligationAlerts(params: {
  asOfDate: string;
  obligations: readonly PlannedCashObligation[];
}): TreasuryAlert[] {
  const alerts: TreasuryAlert[] = [];
  for (const obligation of params.obligations) {
    if (!isOpenObligation(obligation, params.asOfDate)) continue;
    const days = daysUntilDue(obligation.dueDate, params.asOfDate);
    if (days == null || days < 0 || days > 7) continue;
    alerts.push({
      id: `upcoming-${obligation.id}`,
      type: "upcoming_obligation",
      severity: "warning",
      title: `Obligación próxima: ${obligation.title}`,
      description: `Vence en ${days} día${days === 1 ? "" : "s"} (${obligation.dueDate}).`,
      recommendation: "Confirme monto y medio de pago antes del vencimiento.",
      metadata: {
        obligationId: obligation.id,
        dueDate: obligation.dueDate,
        currencyCode: obligation.currencyCode,
        amount: obligationAmount(obligation),
        daysUntilDue: days,
      },
    });
  }
  return alerts;
}

export function buildOverdueObligationAlerts(params: {
  asOfDate: string;
  obligations: readonly PlannedCashObligation[];
}): TreasuryAlert[] {
  const alerts: TreasuryAlert[] = [];
  for (const obligation of params.obligations) {
    const effective = effectivePlannedObligationStatus(
      obligation.status,
      obligation.dueDate,
      params.asOfDate
    );
    if (effective !== "overdue") continue;
    alerts.push({
      id: `overdue-${obligation.id}`,
      type: "overdue_obligation",
      severity: "critical",
      title: `Obligación vencida: ${obligation.title}`,
      description: `La obligación venció el ${obligation.dueDate}.`,
      recommendation: "Priorice el pago o reprograme el compromiso.",
      metadata: {
        obligationId: obligation.id,
        dueDate: obligation.dueDate,
        currencyCode: obligation.currencyCode,
        amount: obligationAmount(obligation),
      },
    });
  }
  return alerts;
}

export function buildProjectedCashRiskAlerts(params: {
  projection: TreasuryCashProjectionResult;
}): TreasuryAlert[] {
  const alerts: TreasuryAlert[] = [];
  for (const snapshot of params.projection.snapshots) {
    if (snapshot.projectedCashUyu >= 0 && snapshot.projectedCashUsd >= 0) continue;
    const negativeCurrencies: TreasuryCurrencyCode[] = [];
    if (snapshot.projectedCashUyu < 0) negativeCurrencies.push("UYU");
    if (snapshot.projectedCashUsd < 0) negativeCurrencies.push("USD");
    alerts.push({
      id: `projected-negative-${snapshot.date}`,
      type: "projected_negative_cash",
      severity: "critical",
      title: "Caja proyectada negativa",
      description: `Para el ${snapshot.date} la proyección muestra saldo negativo en ${negativeCurrencies.join(" y ")}.`,
      recommendation: "Revise egresos confirmados y cobranzas esperadas en el horizonte.",
      metadata: {
        date: snapshot.date,
        projectedCashUyu: snapshot.projectedCashUyu,
        projectedCashUsd: snapshot.projectedCashUsd,
        currencies: negativeCurrencies,
      },
    });
  }
  return alerts;
}

export function buildRunwayAlerts(params: {
  projection: TreasuryCashProjectionResult;
  thresholds?: Partial<TreasuryAlertEngineThresholds>;
}): TreasuryAlert[] {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...params.thresholds };
  const runway = params.projection.runwayDays;
  if (runway == null) return [];

  if (runway < thresholds.runwayCriticalDays) {
    return [
      {
        id: "runway-critical",
        type: "low_cash_runway",
        severity: "critical",
        title: "Runway crítico",
        description: `La caja proyectada cubre menos de ${thresholds.runwayCriticalDays} días.`,
        recommendation: "Acelere cobranzas o postergue egresos no críticos.",
        metadata: { runwayDays: runway },
      },
    ];
  }

  if (runway < thresholds.runwayWarningDays) {
    return [
      {
        id: "runway-warning",
        type: "low_cash_runway",
        severity: "warning",
        title: "Runway acotado",
        description: `La caja proyectada cubre menos de ${thresholds.runwayWarningDays} días.`,
        recommendation: "Monitoree obligaciones de la próxima quincena.",
        metadata: { runwayDays: runway },
      },
    ];
  }

  return [];
}

export function buildUnreconciledBankAlerts(params: {
  asOfDate: string;
  bankMovements: readonly BankReconciliationMovement[];
  thresholds?: Partial<TreasuryAlertEngineThresholds>;
}): TreasuryAlert[] {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...params.thresholds };
  const cutoff = addDaysYmd(params.asOfDate, -thresholds.unreconciledBankDays);
  const alerts: TreasuryAlert[] = [];

  for (const movement of params.bankMovements) {
    if (movement.matchStatus === "matched" || movement.matchStatus === "ignored") continue;
    if (movement.movementDate > params.asOfDate) continue;
    if (movement.movementDate > cutoff) continue;
    alerts.push({
      id: `unreconciled-bank-${movement.id}`,
      type: "unreconciled_bank_movements",
      severity: "warning",
      title: "Movimiento bancario sin conciliar",
      description: `${movement.description} (${movement.movementDate}) sigue pendiente de conciliación.`,
      recommendation: "Concilie o ignore el movimiento para mantener la caja confiable.",
      metadata: {
        bankMovementId: movement.id,
        movementDate: movement.movementDate,
        amount: movement.amount,
        currencyCode: movement.currencyCode,
      },
    });
  }

  return alerts;
}

export function buildBankMismatchAlerts(params: {
  manualMovements: readonly ManualCashMovement[];
  bankMovements: readonly BankReconciliationMovement[];
}): TreasuryAlert[] {
  const alerts: TreasuryAlert[] = [];
  for (const currency of CURRENCIES) {
    let manualBankNet = 0;
    for (const movement of params.manualMovements) {
      if (movement.status !== "active" || movement.ledgerType !== "bank") continue;
      if (movement.currencyCode !== currency) continue;
      manualBankNet += signedManualCashAmount({
        movementType: movement.movementType,
        amount: movement.amount,
        metadata: movement.metadata,
      });
    }

    let bankNet = 0;
    for (const movement of params.bankMovements) {
      if (!shouldCountBankInCashflow(movement, params.manualMovements)) continue;
      if (movement.currencyCode !== currency) continue;
      bankNet += signedBankMovementAmount(movement.movementType, movement.amount);
    }

    const delta = Math.abs(manualBankNet - bankNet);
    if (delta < 1) continue;
    alerts.push({
      id: `bank-mismatch-${currency}`,
      type: "bank_balance_mismatch",
      severity: "warning",
      title: `Descalce banco ${currency}`,
      description: `La caja manual banco y el extracto difieren en ${delta.toFixed(2)} ${currency}.`,
      recommendation: "Revise importaciones Santander y movimientos manuales del período.",
      metadata: {
        currencyCode: currency,
        manualBankNet,
        bankNet,
        delta,
      },
    });
  }
  return alerts;
}

export function buildUnusualExpenseAlerts(params: {
  asOfDate: string;
  manualMovements: readonly ManualCashMovement[];
  lookbackDays?: number;
}): TreasuryAlert[] {
  const lookbackDays = params.lookbackDays ?? 30;
  const fromDate = addDaysYmd(params.asOfDate, -lookbackDays);
  const alerts: TreasuryAlert[] = [];

  for (const currency of CURRENCIES) {
    const expenses = params.manualMovements.filter((movement) => {
      if (movement.status !== "active") return false;
      if (movement.movementType !== "expense") return false;
      if (movement.currencyCode !== currency) return false;
      return movement.movementDate >= fromDate && movement.movementDate <= params.asOfDate;
    });
    if (expenses.length < 3) continue;

    const total = expenses.reduce((sum, movement) => sum + movement.amount, 0);
    const average = total / expenses.length;
    const latest = expenses
      .filter((movement) => movement.movementDate === params.asOfDate)
      .sort((a, b) => b.amount - a.amount)[0];
    if (!latest || latest.amount <= average * DEFAULT_THRESHOLDS.unusualExpenseMultiplier) continue;

    alerts.push({
      id: `unusual-expense-${latest.id}`,
      type: "unusual_expense",
      severity: "warning",
      title: `Egreso inusual en ${currency}`,
      description: `${latest.concept} supera el promedio reciente de egresos manuales.`,
      recommendation: "Valide categoría y soporte del gasto.",
      metadata: {
        movementId: latest.id,
        amount: latest.amount,
        averageExpense: average,
        currencyCode: currency,
      },
    });
  }

  return alerts;
}

export function buildHighUpcomingOutflowAlerts(params: {
  asOfDate: string;
  obligations: readonly PlannedCashObligation[];
  manualMovements: readonly ManualCashMovement[];
  withinDays?: number;
  thresholds?: Partial<TreasuryAlertEngineThresholds>;
}): TreasuryAlert[] {
  const withinDays = params.withinDays ?? 30;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...params.thresholds };
  const alerts: TreasuryAlert[] = [];
  const cashImpact = getManualCashImpact(params.manualMovements);

  for (const currency of CURRENCIES) {
    const cash = cashImpact[currency] ?? 0;
    if (cash <= 0) continue;

    const outflow = params.obligations
      .filter((obligation) => {
        if (!isOpenObligation(obligation, params.asOfDate)) return false;
        if (obligation.currencyCode !== currency) return false;
        if (obligation.direction !== "outflow") return false;
        const days = daysUntilDue(obligation.dueDate, params.asOfDate);
        return days != null && days >= 0 && days <= withinDays;
      })
      .reduce((sum, obligation) => sum + obligationAmount(obligation), 0);

    if (outflow <= 0) continue;
    const share = outflow / cash;
    if (share < thresholds.upcomingOutflowShare) continue;

    alerts.push({
      id: `high-outflow-${currency}`,
      type: "high_upcoming_outflow",
      severity: share >= 0.5 ? "critical" : "warning",
      title: `Egresos próximos elevados (${currency})`,
      description: `Las obligaciones de los próximos ${withinDays} días representan ${Math.round(share * 100)}% de la caja actual.`,
      recommendation: "Reserve liquidez o confirme cobranzas antes de comprometer nuevos pagos.",
      metadata: {
        currencyCode: currency,
        outflow,
        cash,
        share,
        withinDays,
      },
    });
  }

  return alerts;
}

export function buildTreasuryAlerts(params: {
  asOfDate: string;
  obligations: readonly PlannedCashObligation[];
  /** Pre-filtered overdue obligations — excludes paused recurring templates. When provided,
   *  replaces `obligations` for overdue alert computation. */
  overdueObligations?: readonly PlannedCashObligation[];
  /** Pre-filtered upcoming obligations — excludes paused recurring templates. When provided,
   *  replaces `obligations` for upcoming + high-outflow alert computation. */
  upcomingObligations?: readonly PlannedCashObligation[];
  manualMovements: readonly ManualCashMovement[];
  bankMovements: readonly BankReconciliationMovement[];
  projection?: TreasuryCashProjectionResult;
  thresholds?: Partial<TreasuryAlertEngineThresholds>;
}): TreasuryAlert[] {
  const forOverdue = params.overdueObligations ?? params.obligations;
  const forUpcoming = params.upcomingObligations ?? params.obligations;
  const alerts = [
    ...buildOverdueObligationAlerts({
      asOfDate: params.asOfDate,
      obligations: forOverdue,
    }),
    ...buildUpcomingObligationAlerts({
      asOfDate: params.asOfDate,
      obligations: forUpcoming,
    }),
    ...buildUnreconciledBankAlerts({
      asOfDate: params.asOfDate,
      bankMovements: params.bankMovements,
      thresholds: params.thresholds,
    }),
    ...buildBankMismatchAlerts({
      manualMovements: params.manualMovements,
      bankMovements: params.bankMovements,
    }),
    ...buildUnusualExpenseAlerts({
      asOfDate: params.asOfDate,
      manualMovements: params.manualMovements,
    }),
    ...buildHighUpcomingOutflowAlerts({
      asOfDate: params.asOfDate,
      obligations: forUpcoming,
      manualMovements: params.manualMovements,
      thresholds: params.thresholds,
    }),
  ];

  if (params.projection) {
    alerts.push(
      ...buildProjectedCashRiskAlerts({ projection: params.projection }),
      ...buildRunwayAlerts({ projection: params.projection, thresholds: params.thresholds })
    );
  }

  const severityRank: Record<TreasuryAlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

export function countActiveManualCash(
  manualMovements: readonly ManualCashMovement[]
): Partial<Record<TreasuryCurrencyCode, number>> {
  const out: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const movement of manualMovements) {
    if (!shouldCountManualCashInCashflow(movement)) continue;
    const signed = signedManualCashAmount({
      movementType: movement.movementType,
      amount: movement.amount,
      metadata: movement.metadata,
    });
    out[movement.currencyCode] = (out[movement.currencyCode] ?? 0) + signed;
  }
  return out;
}
