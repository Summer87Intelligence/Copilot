import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { ClientCompanyDetail } from "@/lib/copilot-clients-portfolio";

export type DebtorsReportCurrencyFilter = "all" | "UYU" | "USD";

export type DebtorsReportStatusFilter =
  | "all"
  | "overdue"
  | "critical"
  | "without_contact";

export type DebtorsReportOverdueDaysFilter = "all" | "30" | "60" | "90";

export type DebtorsReportContactFilter = "all" | "with_contact" | "without_contact";

export type DebtorsReportFilters = {
  currency: DebtorsReportCurrencyFilter;
  status: DebtorsReportStatusFilter;
  minUyu: number;
  minUsd: number;
  overdueDays: DebtorsReportOverdueDaysFilter;
  contact: DebtorsReportContactFilter;
};

export type DebtorsReportRow = {
  clientId: string;
  clientName: string;
  currency: "UYU" | "USD";
  debtAmount: number;
  overdueAmount: number;
  oldestDueDate: string | null;
  overdueDays: number | null;
  overdueDaysLabel: string;
  statusLabel: string;
  agingBadge: string | null;
  contactLabel: string;
  href: string;
};

export type DebtorsReportModel = {
  emittedAt: string;
  emittedAtLabel: string;
  issuerName: string;
  currencyFilter: DebtorsReportCurrencyFilter;
  filtersLabel: string[];
  totals: {
    clientsCount: number;
    totalDebtUyu: number;
    totalDebtUsd: number;
    totalOverdueUyu: number;
    totalOverdueUsd: number;
  };
  rows: DebtorsReportRow[];
};

export type BuildDebtorsReportModelInput = {
  portfolioRows: ClientPortfolioRow[];
  details?: Record<string, ClientCompanyDetail>;
  filters: DebtorsReportFilters;
  emittedAt?: Date;
};

export const DEFAULT_DEBTORS_REPORT_FILTERS: DebtorsReportFilters = {
  currency: "all",
  status: "all",
  minUyu: 0,
  minUsd: 0,
  overdueDays: "all",
  contact: "all",
};
