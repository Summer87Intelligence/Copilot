import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";

export type TopClientsReportCurrency = "UYU" | "USD";
export type TopClientsReportSortBy = "net_sales" | "debt" | "overdue";

export type TopClientsReportRow = {
  rank: number;
  companyId: string;
  clientName: string;
  netSales: number;
  totalDebt: number;
  overdueDebt: number;
  sharePercent: number;
  risk: string;
  currency: TopClientsReportCurrency;
};

export type TopClientsReportPeriod = {
  year: number;
  month: number;
  label: string;
};

export type TopClientsReportModel = {
  generatedAt: string;
  issuerName: string;
  period: TopClientsReportPeriod;
  currency: TopClientsReportCurrency;
  sortBy: TopClientsReportSortBy;
  rows: TopClientsReportRow[];
  totals: {
    clientCount: number;
    netSales: number;
    totalDebt: number;
    overdueDebt: number;
  };
};

export type BuildTopClientsReportModelInput = {
  portfolioRows: ClientPortfolioRow[];
  year: number;
  month: number;
  currency: TopClientsReportCurrency;
  sortBy?: TopClientsReportSortBy;
  generatedAt?: Date;
  issuerName?: string;
};

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function topClientsMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_ES[month - 1] ?? `Mes ${month}`} ${year}`;
}

function billingForCurrency(row: ClientPortfolioRow, currency: TopClientsReportCurrency): number {
  if (currency === "UYU") return row.billing_uyu ?? 0;
  return row.billing_usd ?? 0;
}

function debtForCurrency(row: ClientPortfolioRow, currency: TopClientsReportCurrency): number {
  return currency === "UYU" ? row.debt_uyu : row.debt_usd;
}

function overdueForCurrency(row: ClientPortfolioRow, currency: TopClientsReportCurrency): number {
  if (currency === "UYU") return row.overdue_uyu ?? 0;
  return row.overdue_usd ?? 0;
}

function sortComparator(
  a: TopClientsReportRow,
  b: TopClientsReportRow,
  sortBy: TopClientsReportSortBy
): number {
  let diff: number;
  switch (sortBy) {
    case "debt":
      diff = b.totalDebt - a.totalDebt;
      break;
    case "overdue":
      diff = b.overdueDebt - a.overdueDebt;
      break;
    default:
      diff = b.netSales - a.netSales;
  }
  if (diff !== 0) return diff;
  return a.clientName.localeCompare(b.clientName, "es");
}

export function buildTopClientsReportModel(
  input: BuildTopClientsReportModelInput
): TopClientsReportModel {
  const {
    portfolioRows,
    year,
    month,
    currency,
    sortBy = "net_sales",
    generatedAt,
    issuerName,
  } = input;
  const at = generatedAt ?? new Date();

  const active = portfolioRows.filter((r) => {
    const billing = billingForCurrency(r, currency);
    const debt = debtForCurrency(r, currency);
    return billing > 0 || debt > 0;
  });

  const totalNetSales = active.reduce((s, r) => s + billingForCurrency(r, currency), 0);

  const unsorted: TopClientsReportRow[] = active.map((r) => {
    const netSales = billingForCurrency(r, currency);
    return {
      rank: 0,
      companyId: r.company_id,
      clientName: r.name,
      netSales,
      totalDebt: debtForCurrency(r, currency),
      overdueDebt: overdueForCurrency(r, currency),
      sharePercent: totalNetSales > 0 ? (netSales / totalNetSales) * 100 : 0,
      risk: r.risk,
      currency,
    };
  });

  unsorted.sort((a, b) => sortComparator(a, b, sortBy));

  const rows: TopClientsReportRow[] = unsorted.map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    generatedAt: at.toISOString(),
    issuerName: issuerName?.trim() ?? "",
    period: {
      year,
      month,
      label: topClientsMonthLabel(year, month),
    },
    currency,
    sortBy,
    rows,
    totals: {
      clientCount: rows.length,
      netSales: rows.reduce((s, r) => s + r.netSales, 0),
      totalDebt: rows.reduce((s, r) => s + r.totalDebt, 0),
      overdueDebt: rows.reduce((s, r) => s + r.overdueDebt, 0),
    },
  };
}
