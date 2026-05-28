import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { ClientCompanyDetail } from "@/lib/copilot-clients-portfolio";

import {
  computeCurrencyOverdueAging,
} from "./compute-currency-overdue-aging";
import { describeActiveDebtorsReportFilters } from "./debtors-report-filters";
import type {
  BuildDebtorsReportModelInput,
  DebtorsReportFilters,
  DebtorsReportModel,
  DebtorsReportRow,
} from "./debtors-report-types";
import { sortDebtorsReportRows } from "./sort-debtors-report-rows";
import { buildReportContactLabel } from "./valid-report-contact";

function formatEmittedAtLabel(date: Date): string {
  const d = date.toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Montevideo",
  });
  const t = date.toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Montevideo",
  });
  return `${d} ${t}`;
}

function formatAgingLabel(overdueDays: number | null): string {
  if (overdueDays == null || overdueDays < 0) return "—";
  return `${overdueDays} día${overdueDays === 1 ? "" : "s"}`;
}

function rowStatusLabel(
  overdueAmount: number,
  risk: ClientPortfolioRow["risk"]
): string {
  if (overdueAmount <= 0) return "Pendiente";
  if (risk === "Alto") return "Crítico";
  return "Vencido";
}

function matchesStatusFilter(
  row: ClientPortfolioRow,
  overdueAmount: number,
  filters: DebtorsReportFilters
): boolean {
  switch (filters.status) {
    case "overdue":
      return overdueAmount > 0;
    case "critical":
      return overdueAmount > 0 && row.risk === "Alto";
    case "without_contact":
      return !row.has_contact_data;
    case "all":
    default:
      return true;
  }
}

function matchesContactFilter(row: ClientPortfolioRow, filters: DebtorsReportFilters): boolean {
  switch (filters.contact) {
    case "with_contact":
      return row.has_contact_data;
    case "without_contact":
      return !row.has_contact_data;
    default:
      return true;
  }
}

function matchesOverdueDaysFilter(
  overdueDays: number | null,
  overdueAmount: number,
  filters: DebtorsReportFilters
): boolean {
  if (filters.overdueDays === "all") return true;
  const threshold = Number(filters.overdueDays);
  if (!Number.isFinite(threshold)) return true;
  if (overdueAmount <= 0) return false;
  if (overdueDays == null) return false;
  return overdueDays >= threshold;
}

function matchesMinAmount(
  currency: "UYU" | "USD",
  debtAmount: number,
  filters: DebtorsReportFilters
): boolean {
  if (currency === "UYU" && filters.minUyu > 0 && debtAmount < filters.minUyu) return false;
  if (currency === "USD" && filters.minUsd > 0 && debtAmount < filters.minUsd) return false;
  return true;
}

function buildCurrencyRow(
  row: ClientPortfolioRow,
  currency: "UYU" | "USD",
  debtAmount: number,
  overdueAmount: number,
  details: Record<string, ClientCompanyDetail> | undefined,
  emittedAt: Date
): DebtorsReportRow {
  const detail = details?.[row.company_id];
  const aging = detail?.invoices?.length
    ? computeCurrencyOverdueAging(detail.invoices, currency, emittedAt)
    : { oldestDueDate: null, overdueDays: null, usedIssueDateFallback: false };

  const overdueDays = overdueAmount > 0 ? aging.overdueDays : null;

  return {
    clientId: row.company_id,
    clientName: row.name,
    currency,
    debtAmount,
    overdueAmount,
    oldestDueDate: overdueAmount > 0 ? aging.oldestDueDate : null,
    overdueDays,
    overdueDaysLabel: overdueAmount > 0 ? formatAgingLabel(overdueDays) : "—",
    statusLabel: rowStatusLabel(overdueAmount, row.risk),
    agingBadge: null,
    contactLabel: buildReportContactLabel({
      phone: row.contact_phone,
      email: row.contact_email,
    }),
    href: `/copilot/clientes/${row.company_id}`,
  };
}

export function buildDebtorsReportModel(input: BuildDebtorsReportModelInput): DebtorsReportModel {
  const emittedAt = input.emittedAt ?? new Date();
  const filters = input.filters;
  const rows: DebtorsReportRow[] = [];

  for (const row of input.portfolioRows) {
    const currencies: Array<{
      currency: "UYU" | "USD";
      debt: number;
      overdue: number;
    }> = [];

    if ((row.debt_uyu ?? 0) > 0) {
      currencies.push({
        currency: "UYU",
        debt: row.debt_uyu ?? 0,
        overdue: row.overdue_uyu ?? (row.debt_usd === 0 ? row.overdue_debt : 0),
      });
    }
    if ((row.debt_usd ?? 0) > 0) {
      currencies.push({
        currency: "USD",
        debt: row.debt_usd ?? 0,
        overdue: row.overdue_usd ?? (row.debt_uyu === 0 ? row.overdue_debt : 0),
      });
    }

    for (const { currency, debt, overdue } of currencies) {
      if (filters.currency !== "all" && filters.currency !== currency) continue;
      if (!matchesMinAmount(currency, debt, filters)) continue;
      if (!matchesStatusFilter(row, overdue, filters)) continue;
      if (!matchesContactFilter(row, filters)) continue;

      const reportRow = buildCurrencyRow(
        row,
        currency,
        debt,
        overdue,
        input.details,
        emittedAt
      );

      if (!matchesOverdueDaysFilter(reportRow.overdueDays, overdue, filters)) continue;

      rows.push(reportRow);
    }
  }

  const sortedRows = sortDebtorsReportRows(rows, filters.currency);

  let totalDebtUyu = 0;
  let totalDebtUsd = 0;
  let totalOverdueUyu = 0;
  let totalOverdueUsd = 0;
  for (const r of sortedRows) {
    if (r.currency === "UYU") {
      totalDebtUyu += r.debtAmount;
      totalOverdueUyu += r.overdueAmount;
    } else {
      totalDebtUsd += r.debtAmount;
      totalOverdueUsd += r.overdueAmount;
    }
  }

  return {
    emittedAt: emittedAt.toISOString(),
    emittedAtLabel: formatEmittedAtLabel(emittedAt),
    issuerName: "",
    currencyFilter: filters.currency,
    filtersLabel: describeActiveDebtorsReportFilters(filters),
    totals: {
      clientsCount: sortedRows.length,
      totalDebtUyu,
      totalDebtUsd,
      totalOverdueUyu,
      totalOverdueUsd,
    },
    rows: sortedRows,
  };
}

/** Cuenta filas que entrarían al reporte (misma lógica que el builder). */
export function countDebtorsReportRows(input: BuildDebtorsReportModelInput): number {
  return buildDebtorsReportModel(input).totals.clientsCount;
}
