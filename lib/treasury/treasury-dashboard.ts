import { evaluateTreasuryAlerts } from "@/lib/treasury/treasury-alerts";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { getTreasuryProjection } from "@/lib/treasury/treasury-projection";
import { signedBankMovementAmount, signedManualCashAmount } from "@/lib/treasury/treasury-sign";
import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
  TreasuryAccount,
  TreasuryAlert,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export type TreasuryCurrencyFilter = TreasuryCurrencyCode | "all";

export type TreasuryDashboardKpis = {
  cashByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
  santanderByCurrency: Partial<Record<TreasuryCurrencyCode, number>>;
  obligationsUpcoming7: number;
  obligationsUpcoming30: number;
  obligationsOverdue: number;
  pendingManualExpenses: number;
  unmatchedBankMovements: number;
};

export type { TreasuryMatchSuggestion } from "@/lib/treasury/treasury-reconciliation-match";
export { computeMatchSuggestions } from "@/lib/treasury/treasury-reconciliation-match";

export type TreasuryProjectionPoint = {
  label: string;
  horizonDays: number;
  asOfDate: string;
  incomeExpected: number;
  outflowExpected: number;
  obligations: number;
  projectedBalance: number;
  currencyCode: TreasuryCurrencyCode;
};

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

function matchesCurrency(filter: TreasuryCurrencyFilter, code: TreasuryCurrencyCode): boolean {
  return filter === "all" || filter === code;
}

function sumManualLedger(
  movements: readonly ManualCashMovement[],
  filter: TreasuryCurrencyFilter,
  ledgerType: ManualCashMovement["ledgerType"]
): Partial<Record<TreasuryCurrencyCode, number>> {
  const out: Partial<Record<TreasuryCurrencyCode, number>> = {};
  for (const m of movements) {
    if (m.status !== "active") continue;
    if (m.ledgerType !== ledgerType) continue;
    if (!matchesCurrency(filter, m.currencyCode)) continue;
    const signed = signedManualCashAmount({
      movementType: m.movementType,
      amount: m.amount,
      metadata: m.metadata,
    });
    out[m.currencyCode] = (out[m.currencyCode] ?? 0) + signed;
  }
  return out;
}

function isSantanderAccount(account: TreasuryAccount | undefined): boolean {
  if (!account) return false;
  const bank = account.bankName?.trim().toLowerCase() ?? "";
  return bank.includes("santander");
}

export function computeTreasuryDashboardKpis(params: {
  accounts: readonly TreasuryAccount[];
  manualMovements: readonly ManualCashMovement[];
  bankMovements: readonly BankReconciliationMovement[];
  obligations: readonly PlannedCashObligation[];
  upcoming7: readonly PlannedCashObligation[];
  upcoming30: readonly PlannedCashObligation[];
  overdue: readonly PlannedCashObligation[];
  asOfDate: string;
  currencyFilter: TreasuryCurrencyFilter;
}): TreasuryDashboardKpis {
  const cashByCurrency = sumManualLedger(
    params.manualMovements,
    params.currencyFilter,
    "cash"
  );

  const santanderByCurrency: Partial<Record<TreasuryCurrencyCode, number>> = {};
  const accountById = new Map(params.accounts.map((a) => [a.id, a]));

  for (const m of params.manualMovements) {
    if (m.status !== "active") continue;
    if (!matchesCurrency(params.currencyFilter, m.currencyCode)) continue;
    const account = m.accountId ? accountById.get(m.accountId) : undefined;
    if (!isSantanderAccount(account) && m.ledgerType !== "bank") continue;
    if (m.ledgerType !== "bank" && !isSantanderAccount(account)) continue;
    const signed = signedManualCashAmount({
      movementType: m.movementType,
      amount: m.amount,
      metadata: m.metadata,
    });
    santanderByCurrency[m.currencyCode] = (santanderByCurrency[m.currencyCode] ?? 0) + signed;
  }

  for (const b of params.bankMovements) {
    if (!matchesCurrency(params.currencyFilter, b.currencyCode)) continue;
    const account = b.accountId ? accountById.get(b.accountId) : undefined;
    const bankName = b.bankName?.trim().toLowerCase() ?? "";
    if (!isSantanderAccount(account) && !bankName.includes("santander")) continue;
    const signed = signedBankMovementAmount(b.movementType, b.amount);
    santanderByCurrency[b.currencyCode] = (santanderByCurrency[b.currencyCode] ?? 0) + signed;
  }

  const obligationsUpcoming7 = params.upcoming7.filter((o) =>
    matchesCurrency(params.currencyFilter, o.currencyCode)
  ).length;
  const obligationsUpcoming30 = params.upcoming30.filter((o) =>
    matchesCurrency(params.currencyFilter, o.currencyCode)
  ).length;
  const obligationsOverdue = params.overdue.filter((o) =>
    matchesCurrency(params.currencyFilter, o.currencyCode)
  ).length;

  const pendingManualExpenses = params.manualMovements.filter((m) => {
    if (m.status !== "active") return false;
    if (m.movementType !== "expense") return false;
    if (!matchesCurrency(params.currencyFilter, m.currencyCode)) return false;
    return !m.reconciled;
  }).length;

  const unmatchedBankMovements = params.bankMovements.filter((b) => {
    if (!matchesCurrency(params.currencyFilter, b.currencyCode)) return false;
    return b.matchStatus === "unmatched" || b.matchStatus === "partial";
  }).length;

  return {
    cashByCurrency,
    santanderByCurrency,
    obligationsUpcoming7,
    obligationsUpcoming30,
    obligationsOverdue,
    pendingManualExpenses,
    unmatchedBankMovements,
  };
}

export function computeTreasuryAlerts(params: {
  asOfDate: string;
  obligations: readonly PlannedCashObligation[];
  bankMovements: readonly BankReconciliationMovement[];
  manualMovements: readonly ManualCashMovement[];
  currencyFilter: TreasuryCurrencyFilter;
}): TreasuryAlert[] {
  const alerts = evaluateTreasuryAlerts({
    asOfDate: params.asOfDate,
    obligations: params.obligations,
    bankMovements: params.bankMovements,
  });

  const cash = sumManualLedger(params.manualMovements, params.currencyFilter, "cash");
  const filtered = alerts.filter((a) => matchesCurrency(params.currencyFilter, a.currencyCode));

  for (const currency of CURRENCIES) {
    if (!matchesCurrency(params.currencyFilter, currency)) continue;
    const balance = cash[currency] ?? 0;
    const upcomingOutflow = params.obligations
      .filter((o) => {
        const effective = effectivePlannedObligationStatus(o.status, o.dueDate, params.asOfDate);
        return (
          o.currencyCode === currency &&
          o.direction === "outflow" &&
          effective !== "paid" &&
          effective !== "cancelled"
        );
      })
      .reduce((sum, o) => sum + (o.amountFinal ?? o.amountEstimated), 0);
    if (upcomingOutflow > 0 && balance < upcomingOutflow) {
      filtered.push({
        kind: "critical_outflow_threshold",
        severity: "critical",
        message: `Caja ${currency} insuficiente frente a obligaciones abiertas.`,
        recordId: `cash-${currency}`,
        currencyCode: currency,
        amount: upcomingOutflow - balance,
      });
    }
    if (balance < 0) {
      filtered.push({
        kind: "bank_unmatched_threshold",
        severity: "warning",
        message: `Caja ${currency} en negativo según movimientos manuales.`,
        recordId: `cash-negative-${currency}`,
        currencyCode: currency,
        amount: Math.abs(balance),
      });
    }
  }

  return filtered;
}

export function buildProjectionTimeline(params: {
  asOfDate: string;
  manualMovements: readonly ManualCashMovement[];
  bankMovements: readonly BankReconciliationMovement[];
  obligations: readonly PlannedCashObligation[];
  currencyFilter: TreasuryCurrencyFilter;
}): TreasuryProjectionPoint[] {
  const horizons = [
    { label: "Hoy", days: 0 },
    { label: "+7 días", days: 7 },
    { label: "+15 días", days: 15 },
    { label: "+30 días", days: 30 },
    { label: "+60 días", days: 60 },
  ];
  const points: TreasuryProjectionPoint[] = [];

  for (const currency of CURRENCIES) {
    if (!matchesCurrency(params.currencyFilter, currency)) continue;
    for (const horizon of horizons) {
      const asOfMs = Date.parse(`${params.asOfDate}T12:00:00.000Z`);
      const target = Number.isFinite(asOfMs)
        ? new Date(asOfMs + horizon.days * 86_400_000).toISOString().slice(0, 10)
        : params.asOfDate;
      const snapshot = getTreasuryProjection({
        asOfDate: target,
        manualMovements: params.manualMovements,
        bankMovements: params.bankMovements,
        obligations: params.obligations,
        obligationHorizonDays: horizon.days || 1,
      });
      const bucket = snapshot.buckets.find((b) => b.currencyCode === currency);
      if (!bucket) continue;
      points.push({
        label: horizon.label,
        horizonDays: horizon.days,
        asOfDate: target,
        incomeExpected: bucket.obligationInflow,
        outflowExpected: bucket.obligationOutflow,
        obligations: bucket.obligationOutflow + bucket.obligationInflow,
        projectedBalance: bucket.projectedNet,
        currencyCode: currency,
      });
    }
  }

  return points;
}

export function formatTreasuryMoney(
  amount: number,
  currency: TreasuryCurrencyCode
): string {
  return `${currency} ${amount.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;
}
