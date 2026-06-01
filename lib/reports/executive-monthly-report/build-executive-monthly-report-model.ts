import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import { buildCashMonthlyReportModel } from "@/lib/reports/cash-monthly-report/build-cash-monthly-report-model";
import { cashMonthlyMonthRange } from "@/lib/reports/cash-monthly-report/build-cash-monthly-report-model";
import { buildDebtorsReportModel } from "@/lib/reports/debtors-report/build-debtors-report-model";
import { buildNetSalesReportModel } from "@/lib/reports/net-sales-report/build-net-sales-report-model";
import { buildTopClientsReportModel } from "@/lib/reports/top-clients-report/build-top-clients-report-model";
import type { TreasuryCashOpeningBalanceRow } from "@/lib/treasury/repositories/treasury-cash-opening-balance-repository";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

export type ExecutiveReportCurrency = "UYU" | "USD";
export type ExecutiveRiskLevel = "Bajo" | "Atención" | "Crítico";

export type ExecutiveTopClient = {
  rank: number;
  clientName: string;
  netSales: number;
  sharePercent: number;
};

export type ExecutiveTopDebtor = {
  rank: number;
  clientName: string;
  debtAmount: number;
  overdueAmount: number;
  risk: string;
};

export type ExecutiveMonthlyReportModel = {
  generatedAt: string;
  issuerName: string;
  period: {
    year: number;
    month: number;
    label: string;
    from: string;
    to: string;
  };
  currency: ExecutiveReportCurrency;
  keyMetrics: {
    netSales: number;
    creditNoteTotal: number;
    cashOpeningBalance: number;
    cashIncome: number;
    cashExpense: number;
    cashClosingBalance: number;
    totalDebt: number;
    overdueDebt: number;
    activeClients: number;
  };
  top5Clients: ExecutiveTopClient[];
  top5Debtors: ExecutiveTopDebtor[];
  riskLevel: ExecutiveRiskLevel;
  alerts: string[];
};

export type BuildExecutiveMonthlyReportModelInput = {
  movements: ManualCashMovement[];
  openingBalances: TreasuryCashOpeningBalanceRow[];
  invoices: DataRow[];
  companyNames: Record<string, string>;
  portfolioRows: ClientPortfolioRow[];
  year: number;
  month: number;
  currency: ExecutiveReportCurrency;
  generatedAt?: Date;
  issuerName?: string;
};

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function executiveMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_ES[month - 1] ?? `Mes ${month}`} ${year}`;
}

function computeRiskLevel(
  overdueDebt: number,
  totalDebt: number,
  cashClosingBalance: number
): ExecutiveRiskLevel {
  if (cashClosingBalance < 0) return "Crítico";
  if (totalDebt > 0 && overdueDebt / totalDebt >= 0.4) return "Crítico";
  if (overdueDebt > 0) return "Atención";
  return "Bajo";
}

function buildAlerts(
  overdueDebt: number,
  overdueDebtorsCount: number,
  highRiskCount: number,
  cashClosingBalance: number,
  currency: ExecutiveReportCurrency
): string[] {
  const alerts: string[] = [];
  if (cashClosingBalance < 0) {
    alerts.push(`Saldo de caja negativo en ${currency}.`);
  }
  if (overdueDebtorsCount > 0) {
    alerts.push(
      `${overdueDebtorsCount} cliente${overdueDebtorsCount > 1 ? "s" : ""} con deuda vencida en ${currency}: ${overdueDebt.toLocaleString("es-UY", { maximumFractionDigits: 0 })}.`
    );
  }
  if (highRiskCount > 0) {
    alerts.push(
      `${highRiskCount} cliente${highRiskCount > 1 ? "s" : ""} con riesgo Alto.`
    );
  }
  return alerts;
}

export function buildExecutiveMonthlyReportModel(
  input: BuildExecutiveMonthlyReportModelInput
): ExecutiveMonthlyReportModel {
  const {
    movements,
    openingBalances,
    invoices,
    companyNames,
    portfolioRows,
    year,
    month,
    currency,
    generatedAt,
    issuerName,
  } = input;
  const at = generatedAt ?? new Date();
  const { from, to } = cashMonthlyMonthRange(year, month);

  const cashModel = buildCashMonthlyReportModel({
    movements,
    openingBalances,
    year,
    month,
    currency,
    generatedAt: at,
    issuerName,
  });

  const netSalesModel = buildNetSalesReportModel({
    invoices,
    companyNames,
    year,
    month,
    currency,
    generatedAt: at,
    issuerName,
  });

  const topClientsModel = buildTopClientsReportModel({
    portfolioRows,
    year,
    month,
    currency,
    sortBy: "net_sales",
    generatedAt: at,
    issuerName,
  });

  const debtorsModel = buildDebtorsReportModel({
    portfolioRows,
    filters: {
      currency,
      status: "all",
      minUyu: 0,
      minUsd: 0,
      overdueDays: "all",
      contact: "all",
    },
    emittedAt: at,
  });

  const top5Clients: ExecutiveTopClient[] = topClientsModel.rows.slice(0, 5).map((r) => ({
    rank: r.rank,
    clientName: r.clientName,
    netSales: r.netSales,
    sharePercent: r.sharePercent,
  }));

  const top5Debtors: ExecutiveTopDebtor[] = debtorsModel.rows.slice(0, 5).map((r, i) => ({
    rank: i + 1,
    clientName: r.clientName,
    debtAmount: r.debtAmount,
    overdueAmount: r.overdueAmount,
    risk: portfolioRows.find((p) => p.company_id === r.clientId)?.risk ?? "Bajo",
  }));

  const totalDebt =
    currency === "UYU" ? debtorsModel.totals.totalDebtUyu : debtorsModel.totals.totalDebtUsd;
  const overdueDebt =
    currency === "UYU"
      ? debtorsModel.totals.totalOverdueUyu
      : debtorsModel.totals.totalOverdueUsd;
  const overdueDebtorsCount = debtorsModel.rows.filter((r) => r.overdueAmount > 0).length;
  const highRiskCount = top5Debtors.filter((r) => r.risk === "Alto").length;

  const riskLevel = computeRiskLevel(
    overdueDebt,
    totalDebt,
    cashModel.totals.closingBalance
  );

  const alerts = buildAlerts(
    overdueDebt,
    overdueDebtorsCount,
    highRiskCount,
    cashModel.totals.closingBalance,
    currency
  );

  return {
    generatedAt: at.toISOString(),
    issuerName: issuerName?.trim() ?? "",
    period: {
      year,
      month,
      label: executiveMonthLabel(year, month),
      from,
      to,
    },
    currency,
    keyMetrics: {
      netSales: netSalesModel.totals.netSales,
      creditNoteTotal: netSalesModel.totals.creditNoteTotal,
      cashOpeningBalance: cashModel.openingBalance,
      cashIncome: cashModel.totals.totalIncome,
      cashExpense: cashModel.totals.totalExpense,
      cashClosingBalance: cashModel.totals.closingBalance,
      totalDebt,
      overdueDebt,
      activeClients: topClientsModel.totals.clientCount,
    },
    top5Clients,
    top5Debtors,
    riskLevel,
    alerts,
  };
}
