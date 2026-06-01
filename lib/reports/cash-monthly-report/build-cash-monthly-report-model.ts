import type { TreasuryCashOpeningBalanceRow } from "@/lib/treasury/repositories/treasury-cash-opening-balance-repository";
import { shouldCountManualCashInCashflow } from "@/lib/treasury/treasury-projection";
import { signedManualCashAmount } from "@/lib/treasury/treasury-sign";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

export type CashReportCurrency = "UYU" | "USD";

export type CashMonthlyReportRow = {
  date: string;
  movementType: string;
  typeLabel: string;
  concept: string;
  income: number;
  expense: number;
  runningBalance: number;
  currency: CashReportCurrency;
};

export type CashMonthlyReportPeriod = {
  year: number;
  month: number;
  label: string;
  from: string;
  to: string;
};

export type CashMonthlyReportModel = {
  generatedAt: string;
  issuerName: string;
  period: CashMonthlyReportPeriod;
  currency: CashReportCurrency;
  openingBalance: number;
  rows: CashMonthlyReportRow[];
  totals: {
    count: number;
    totalIncome: number;
    totalExpense: number;
    closingBalance: number;
  };
};

export type BuildCashMonthlyReportModelInput = {
  movements: ManualCashMovement[];
  openingBalances: TreasuryCashOpeningBalanceRow[];
  year: number;
  month: number;
  currency: CashReportCurrency;
  generatedAt?: Date;
  issuerName?: string;
};

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TYPE_LABELS: Record<string, string> = {
  income: "Ingreso",
  expense: "Egreso",
  adjustment: "Ajuste",
  transfer: "Transferencia",
};

export function cashMonthlyMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_ES[month - 1] ?? `Mes ${month}`} ${year}`;
}

export function cashMonthlyMonthRange(
  year: number,
  month: number
): { from: string; to: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function buildCashMonthlyReportModel(
  input: BuildCashMonthlyReportModelInput
): CashMonthlyReportModel {
  const { movements, openingBalances, year, month, currency, generatedAt, issuerName } = input;
  const at = generatedAt ?? new Date();
  const { from, to } = cashMonthlyMonthRange(year, month);

  const openingBalance =
    openingBalances.find((b) => b.currencyCode === currency)?.amount ?? 0;

  const filtered = movements
    .filter((m) => m.currencyCode === currency)
    .filter((m) => {
      const d = m.movementDate.slice(0, 10);
      return d >= from && d <= to;
    })
    .filter((m) => shouldCountManualCashInCashflow(m))
    .sort((a, b) => {
      const da = a.movementDate.slice(0, 10);
      const db = b.movementDate.slice(0, 10);
      if (da !== db) return da < db ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });

  let balance = openingBalance;
  let totalIncome = 0;
  let totalExpense = 0;

  const rows: CashMonthlyReportRow[] = filtered.map((m) => {
    const signed = signedManualCashAmount({
      movementType: m.movementType,
      amount: m.amount,
      metadata: m.metadata,
    });
    const income = signed > 0 ? signed : 0;
    const expense = signed < 0 ? -signed : 0;
    balance += signed;
    totalIncome += income;
    totalExpense += expense;

    return {
      date: m.movementDate.slice(0, 10),
      movementType: m.movementType,
      typeLabel: TYPE_LABELS[m.movementType] ?? m.movementType,
      concept: m.concept,
      income,
      expense,
      runningBalance: balance,
      currency,
    };
  });

  return {
    generatedAt: at.toISOString(),
    issuerName: issuerName?.trim() ?? "",
    period: {
      year,
      month,
      label: cashMonthlyMonthLabel(year, month),
      from,
      to,
    },
    currency,
    openingBalance,
    rows,
    totals: {
      count: rows.length,
      totalIncome,
      totalExpense,
      closingBalance: balance,
    },
  };
}
