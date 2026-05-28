import type { DebtorsReportCurrencyFilter } from "./debtors-report-types";
import type { DebtorsReportRow } from "./debtors-report-types";

function compareDebtorsRows(a: DebtorsReportRow, b: DebtorsReportRow): number {
  if (b.debtAmount !== a.debtAmount) return b.debtAmount - a.debtAmount;
  if (b.overdueAmount !== a.overdueAmount) return b.overdueAmount - a.overdueAmount;
  return a.clientName.localeCompare(b.clientName, "es");
}

/**
 * Orden: UYU por deuda desc, luego USD por deuda desc (si currency=all).
 * Si filtro moneda única, solo ese grupo desc.
 */
export function sortDebtorsReportRows(
  rows: DebtorsReportRow[],
  currencyFilter: DebtorsReportCurrencyFilter
): DebtorsReportRow[] {
  if (currencyFilter === "UYU") {
    return [...rows].sort(compareDebtorsRows);
  }
  if (currencyFilter === "USD") {
    return [...rows].sort(compareDebtorsRows);
  }

  const uyu = rows.filter((r) => r.currency === "UYU").sort(compareDebtorsRows);
  const usd = rows.filter((r) => r.currency === "USD").sort(compareDebtorsRows);
  return [...uyu, ...usd];
}
