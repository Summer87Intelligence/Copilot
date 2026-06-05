import { dedupeZetaShadowInvoicesForReporting } from "@/lib/copilot-zeta-invoice-report-dedup";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import { parseZetaLegacyRegistroIdFromInvoiceNumber } from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

export type NetSalesReportCurrency = "UYU" | "USD";

export type NetSalesReportInvoiceRow = {
  invoiceId: string;
  issueDate: string;
  invoiceNumber: string;
  clientName: string;
  currency: NetSalesReportCurrency;
  amount: number;
  isCreditNote: boolean;
};

export type NetSalesReportRow = {
  companyId: string;
  clientName: string;
  invoiceCount: number;
  grossSales: number;
  creditNoteCount: number;
  creditNoteTotal: number;
  netSales: number;
  sharePercent: number;
  currency: NetSalesReportCurrency;
};

export type NetSalesReportPeriod = {
  year: number;
  month: number;
  label: string;
  from: string;
  to: string;
};

export type NetSalesReportModel = {
  generatedAt: string;
  issuerName: string;
  period: NetSalesReportPeriod;
  currency: NetSalesReportCurrency;
  rows: NetSalesReportRow[];
  invoiceRows: NetSalesReportInvoiceRow[];
  totals: {
    clientCount: number;
    invoiceCount: number;
    grossSales: number;
    creditNoteCount: number;
    creditNoteTotal: number;
    netSales: number;
    invoiceRowsTotal: number;
  };
};

export type BuildNetSalesReportModelInput = {
  invoices: DataRow[];
  companyNames: Record<string, string>;
  year: number;
  month: number;
  currency: NetSalesReportCurrency;
  generatedAt?: Date;
  issuerName?: string;
};

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function netSalesMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_ES[month - 1] ?? `Mes ${month}`} ${year}`;
}

export function netSalesMonthRange(
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

function getString(row: DataRow, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function getNumber(row: DataRow, key: string): number {
  const v = row[key];
  return typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) || 0 : 0;
}

function isValidInvoice(
  row: DataRow,
  from: string,
  to: string,
  currency: NetSalesReportCurrency
): boolean {
  if (!row.is_active) return false;
  if (getString(row, "status") === "cancelled") return false;
  const date = getString(row, "issue_date");
  if (!date || date < from || date > to) return false;
  if (getString(row, "currency_code") !== currency) return false;
  return true;
}

/** Número legible para PDF: preferir Serie-Número (p. ej. A-2944). */
export function formatNetSalesInvoiceDisplayNumber(
  invoiceNumber: string,
  zetaMetadata: unknown
): string {
  if (zetaMetadata !== null && zetaMetadata !== undefined && typeof zetaMetadata === "object" && !Array.isArray(zetaMetadata)) {
    const v1 = (zetaMetadata as Record<string, unknown>).zeta_customer_voucher_v1;
    if (v1 !== null && v1 !== undefined && typeof v1 === "object" && !Array.isArray(v1)) {
      const rec = v1 as Record<string, unknown>;
      const serie = String(rec.serie ?? "").trim();
      const numero = String(rec.numero ?? "").trim();
      if (serie && numero) return `${serie.toUpperCase()}-${numero}`;
    }
  }

  const num = invoiceNumber.trim();
  if (!num) return "—";

  const ccv1Match = /:([A-Za-z]+):0*(\d+)\s*$/.exec(num);
  if (ccv1Match) return `${ccv1Match[1].toUpperCase()}-${ccv1Match[2]}`;

  const legacyRegistro = parseZetaLegacyRegistroIdFromInvoiceNumber(num);
  if (legacyRegistro) return legacyRegistro;

  return num;
}

function buildInvoiceRows(
  filtered: DataRow[],
  companyNames: Record<string, string>,
  currency: NetSalesReportCurrency
): NetSalesReportInvoiceRow[] {
  const rows: NetSalesReportInvoiceRow[] = filtered.map((row) => {
    const companyId = getString(row, "company_id");
    const rawAmount = getNumber(row, "total_amount");
    const isNC = isCreditNoteFromMetadata(row.zeta_metadata);
    return {
      invoiceId: getString(row, "id"),
      issueDate: getString(row, "issue_date"),
      invoiceNumber: formatNetSalesInvoiceDisplayNumber(
        getString(row, "invoice_number"),
        row.zeta_metadata
      ),
      clientName: companyNames[companyId] ?? "Cliente desconocido",
      currency,
      amount: isNC ? -rawAmount : rawAmount,
      isCreditNote: isNC,
    };
  });

  rows.sort((a, b) => {
    if (a.issueDate !== b.issueDate) return a.issueDate.localeCompare(b.issueDate);
    if (a.clientName !== b.clientName) return a.clientName.localeCompare(b.clientName, "es");
    return a.invoiceNumber.localeCompare(b.invoiceNumber, "es");
  });

  return rows;
}

export function buildNetSalesReportModel(
  input: BuildNetSalesReportModelInput
): NetSalesReportModel {
  const { invoices, companyNames, year, month, currency, generatedAt, issuerName } = input;
  const at = generatedAt ?? new Date();
  const { from, to } = netSalesMonthRange(year, month);

  const filtered = dedupeZetaShadowInvoicesForReporting(
    invoices.filter((r) => isValidInvoice(r, from, to, currency))
  );

  const invoiceRows = buildInvoiceRows(filtered, companyNames, currency);
  const invoiceRowsTotal = invoiceRows.reduce((s, r) => s + r.amount, 0);

  // Aggregate per client
  type ClientAccum = {
    invoiceCount: number;
    grossSales: number;
    creditNoteCount: number;
    creditNoteTotal: number;
  };
  const byClient = new Map<string, ClientAccum>();

  for (const row of filtered) {
    const companyId = getString(row, "company_id");
    const amount = getNumber(row, "total_amount");
    const isNC = isCreditNoteFromMetadata(row.zeta_metadata);

    if (!byClient.has(companyId)) {
      byClient.set(companyId, {
        invoiceCount: 0,
        grossSales: 0,
        creditNoteCount: 0,
        creditNoteTotal: 0,
      });
    }
    const acc = byClient.get(companyId)!;
    if (isNC) {
      acc.creditNoteCount += 1;
      acc.creditNoteTotal += amount;
    } else {
      acc.invoiceCount += 1;
      acc.grossSales += amount;
    }
  }

  // Build rows
  const unsorted: NetSalesReportRow[] = [];
  let totalNet = 0;

  for (const [companyId, acc] of byClient) {
    const netSales = acc.grossSales - acc.creditNoteTotal;
    totalNet += netSales;
    unsorted.push({
      companyId,
      clientName: companyNames[companyId] ?? "Cliente desconocido",
      invoiceCount: acc.invoiceCount,
      grossSales: acc.grossSales,
      creditNoteCount: acc.creditNoteCount,
      creditNoteTotal: acc.creditNoteTotal,
      netSales,
      sharePercent: 0,
      currency,
    });
  }

  // Sort: netSales DESC, then clientName ASC
  unsorted.sort((a, b) => {
    if (a.netSales !== b.netSales) return b.netSales - a.netSales;
    return a.clientName.localeCompare(b.clientName, "es");
  });

  // Assign share percent
  const rows: NetSalesReportRow[] = unsorted.map((r) => ({
    ...r,
    sharePercent: totalNet > 0 ? (r.netSales / totalNet) * 100 : 0,
  }));

  const totalGross = rows.reduce((s, r) => s + r.grossSales, 0);
  const totalNC = rows.reduce((s, r) => s + r.creditNoteTotal, 0);

  return {
    generatedAt: at.toISOString(),
    issuerName: issuerName?.trim() ?? "",
    period: {
      year,
      month,
      label: netSalesMonthLabel(year, month),
      from,
      to,
    },
    currency,
    rows,
    invoiceRows,
    totals: {
      clientCount: rows.length,
      invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
      grossSales: totalGross,
      creditNoteCount: rows.reduce((s, r) => s + r.creditNoteCount, 0),
      creditNoteTotal: totalNC,
      netSales: totalNet,
      invoiceRowsTotal,
    },
  };
}
