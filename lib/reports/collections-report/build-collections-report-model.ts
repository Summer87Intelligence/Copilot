import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import { isReceiptVoidLike } from "@/lib/copilot-receipts-utils";

export type CollectionsReportCurrency = "UYU" | "USD";

export type CollectionsReportRow = {
  date: string;
  receiptNumber: string | null;
  documentLabel: string;
  clientName: string;
  amount: number;
  currency: CollectionsReportCurrency;
};

export type CollectionsReportPeriod = {
  year: number;
  month: number;
  label: string;
  from: string;
  to: string;
};

export type CollectionsReportModel = {
  generatedAt: string;
  issuerName: string;
  period: CollectionsReportPeriod;
  currency: CollectionsReportCurrency;
  rows: CollectionsReportRow[];
  totals: {
    count: number;
    amount: number;
  };
};

export type BuildCollectionsReportModelInput = {
  receipts: DataRow[];
  companyNames: Record<string, string>;
  year: number;
  month: number;
  currency: CollectionsReportCurrency;
  generatedAt?: Date;
  issuerName?: string;
};

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function collectionsMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_ES[month - 1] ?? `Mes ${month}`} ${year}`;
}

export function collectionsMonthRange(
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

function formatDocumentLabel(receiptNumber: string | null): string {
  if (!receiptNumber) return "—";
  const stripped = receiptNumber.replace(/^ZETA:COB:/i, "");
  return `COB-${stripped}`;
}

function getString(row: DataRow, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function getNumber(row: DataRow, key: string): number {
  const v = row[key];
  return typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) || 0 : 0;
}

function isValidReceipt(
  row: DataRow,
  from: string,
  to: string,
  currency: CollectionsReportCurrency
): boolean {
  if (!row.is_active) return false;
  if (isReceiptVoidLike(getString(row, "status"))) return false;
  const date = getString(row, "receipt_date");
  if (!date || date < from || date > to) return false;
  if (getString(row, "currency_code") !== currency) return false;
  return true;
}

export function buildCollectionsReportModel(
  input: BuildCollectionsReportModelInput
): CollectionsReportModel {
  const { receipts, companyNames, year, month, currency, generatedAt, issuerName } = input;
  const at = generatedAt ?? new Date();
  const { from, to } = collectionsMonthRange(year, month);

  const rows: CollectionsReportRow[] = receipts
    .filter((r) => isValidReceipt(r, from, to, currency))
    .map((r) => {
      const companyId = getString(r, "company_id");
      const receiptNumber =
        r.receipt_number != null && r.receipt_number !== ""
          ? String(r.receipt_number)
          : null;
      return {
        date: getString(r, "receipt_date"),
        receiptNumber,
        documentLabel: formatDocumentLabel(receiptNumber),
        clientName: companyNames[companyId] ?? "Cliente desconocido",
        amount: getNumber(r, "amount"),
        currency,
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date > b.date ? -1 : 1;
      const nc = a.clientName.localeCompare(b.clientName, "es");
      if (nc !== 0) return nc;
      return (a.documentLabel ?? "").localeCompare(b.documentLabel ?? "", "es");
    });

  return {
    generatedAt: at.toISOString(),
    issuerName: issuerName?.trim() ?? "",
    period: {
      year,
      month,
      label: collectionsMonthLabel(year, month),
      from,
      to,
    },
    currency,
    rows,
    totals: {
      count: rows.length,
      amount: rows.reduce((s, r) => s + r.amount, 0),
    },
  };
}
