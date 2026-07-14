import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import { buildNetSalesReportModel } from "@/lib/reports/net-sales-report/build-net-sales-report-model";

export type TopClientsReportCurrency = "UYU" | "USD";
export type TopClientsReportSortBy = "net_sales" | "debt" | "overdue";

export type TopClientsReportRow = {
  rank: number;
  companyId: string;
  clientName: string;
  /** Ventas netas EMITIDAS en el período seleccionado (issue_date, neto de NC). */
  netSales: number;
  /** Deuda actual del cliente en la moneda (stock al día de la emisión). */
  totalDebt: number;
  /** Deuda atrasada del cliente en la moneda (stock al día de la emisión). */
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

/**
 * TOP-CLIENTS-PERIOD-NET-SALES-001 — `netSales` proviene de ventas netas
 * emitidas DENTRO del período (issue_date), NO de la facturación lifetime del
 * portfolio (`billing_uyu/usd`). Reutiliza `buildNetSalesReportModel` como
 * fuente canónica de ventas por cliente del período. La deuda y el atraso
 * siguen siendo stock actual desde el portfolio.
 */
export type BuildTopClientsReportModelInput = {
  /** Facturas del tenant (issue_date filtra el período dentro del builder). */
  invoices: DataRow[];
  /** company_id → nombre visible del cliente. */
  companyNames: Record<string, string>;
  /** Filas de portfolio para deuda/atraso/riesgo actuales (stock). */
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

type ClientAccum = {
  companyId: string;
  clientName: string;
  netSales: number;
  totalDebt: number;
  overdueDebt: number;
  risk: string;
};

export function buildTopClientsReportModel(
  input: BuildTopClientsReportModelInput
): TopClientsReportModel {
  const {
    invoices,
    companyNames,
    portfolioRows,
    year,
    month,
    currency,
    sortBy = "net_sales",
    generatedAt,
    issuerName,
  } = input;
  const at = generatedAt ?? new Date();

  // Fuente canónica de ventas del período por cliente (issue_date, neto de NC,
  // moneda separada, dedupe shadow Zeta).
  const netSalesModel = buildNetSalesReportModel({
    invoices,
    companyNames,
    year,
    month,
    currency,
  });

  const byClient = new Map<string, ClientAccum>();

  const ensure = (companyId: string, fallbackName: string): ClientAccum => {
    let acc = byClient.get(companyId);
    if (!acc) {
      acc = {
        companyId,
        clientName: fallbackName,
        netSales: 0,
        totalDebt: 0,
        overdueDebt: 0,
        risk: "Bajo",
      };
      byClient.set(companyId, acc);
    }
    return acc;
  };

  for (const r of netSalesModel.rows) {
    const acc = ensure(r.companyId, r.clientName);
    acc.netSales = r.netSales;
    if (r.clientName) acc.clientName = r.clientName;
  }

  for (const p of portfolioRows) {
    const totalDebt = debtForCurrency(p, currency);
    const overdueDebt = overdueForCurrency(p, currency);
    const netSales = byClient.get(p.company_id)?.netSales ?? 0;
    // Incluir solo clientes con actividad en la moneda seleccionada.
    if (!(netSales > 0 || totalDebt > 0 || overdueDebt > 0)) continue;
    const acc = ensure(p.company_id, p.name);
    acc.totalDebt = totalDebt;
    acc.overdueDebt = overdueDebt;
    acc.risk = p.risk;
    if (p.name) acc.clientName = p.name;
  }

  // Descartar clientes que quedaron solo con ventas <= 0 y sin deuda.
  const accums = [...byClient.values()].filter(
    (a) => a.netSales > 0 || a.totalDebt > 0 || a.overdueDebt > 0
  );

  const totalNetSales = accums.reduce((s, a) => s + a.netSales, 0);

  const unsorted: TopClientsReportRow[] = accums.map((a) => ({
    rank: 0,
    companyId: a.companyId,
    clientName: a.clientName,
    netSales: a.netSales,
    totalDebt: a.totalDebt,
    overdueDebt: a.overdueDebt,
    sharePercent: totalNetSales > 0 ? (a.netSales / totalNetSales) * 100 : 0,
    risk: a.risk,
    currency,
  }));

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
