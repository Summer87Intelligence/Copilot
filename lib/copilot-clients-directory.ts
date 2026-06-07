/**
 * Directorio unificado de clientes: contacts (proto_companies) + deudores solo en facturas.
 *
 * Cartera / Explorador usan `company_id` en facturas; Clientes solo listaba empresas
 * en `proto_companies` activas — omitía deudores sin fila de empresa o inactivos.
 */

import { isVoidedFinancialInvoice } from "@/lib/copilot-client-current-debt-summary";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import {
  aggregateOperationalDebtForCompany,
  selectOperationalDebtInvoicesForSummation,
} from "@/lib/zeta/zeta-operational-debt-dedup";

export type ClientDirectorySource = "contact" | "zeta_invoice" | "merged";

export type ClientDirectoryCompanyInput = {
  id: string;
  name?: string | null;
  industry?: string | null;
  sector?: string | null;
  is_active?: boolean | null;
};

export type ClientDirectoryInvoiceInput = {
  id?: string;
  company_id?: string | null;
  invoice_number?: string | null;
  category?: string | null;
  total_amount?: unknown;
  balance_amount?: unknown;
  balanceFromFinancialsMap?: Map<string, number>;
  status?: string | null;
  due_date?: unknown;
  issue_date?: unknown;
  currency_code?: string | null;
  zeta_metadata?: unknown;
};

export type ClientDirectoryContactInput = {
  company_id?: string | null;
};

export type ClientDirectoryEntry = {
  company_id: string;
  name: string;
  industry: string;
  source: ClientDirectorySource;
  /** Empresa existe en proto_companies (activa o recuperada por id). */
  has_contact_record: boolean;
  has_contact_data: boolean;
  derived_from_debt: boolean;
  hasDebt: boolean;
  debtUYU: number;
  debtUSD: number;
  total_debt: number;
  overdue_debt: number;
  total_billing: number;
  invoiceCount: number;
  receipts_count: number;
  is_active: boolean | null;
};

export type BuildClientsDirectoryInput = {
  companies: readonly ClientDirectoryCompanyInput[];
  invoices: readonly ClientDirectoryInvoiceInput[];
  contacts?: readonly ClientDirectoryContactInput[];
  receiptsByCompany?: ReadonlyMap<string, number>;
  invoiceBalanceMap?: Map<string, number>;
  todayYmd?: string;
};

export type ClientsDirectoryDiagnostics = {
  companies_active_loaded: number;
  unique_company_ids_on_invoices: number;
  debtors_on_invoices: number;
  debtors_missing_company_row: number;
  debtors_inactive_company_row: number;
  directory_total: number;
};

export type ClientsDirectoryResult = {
  entries: ClientDirectoryEntry[];
  diagnostics: ClientsDirectoryDiagnostics;
};

const PENDING_EPSILON = 0.005;

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function industryOf(c: ClientDirectoryCompanyInput): string {
  const raw = c.industry ?? c.sector ?? "";
  const s = String(raw).trim();
  return s || "—";
}

/** Nombre Zeta en metadata de factura (sin inventar PII). */
export function readInvoiceZetaClientName(zeta_metadata: unknown): string | null {
  if (!zeta_metadata || typeof zeta_metadata !== "object" || Array.isArray(zeta_metadata)) {
    return null;
  }
  const root = zeta_metadata as Record<string, unknown>;
  const v1 = root.zeta_customer_voucher_v1;
  if (v1 && typeof v1 === "object" && !Array.isArray(v1)) {
    const name = (v1 as Record<string, unknown>).zeta_cliente_nombre;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return null;
}

function shortCompanyLabel(companyId: string): string {
  const tail = companyId.replace(/-/g, "").slice(0, 8);
  return tail ? `Cliente · ${tail}` : "Cliente (facturación)";
}

/**
 * Une proto_companies con deudores detectados en facturas (misma lógica que Cartera).
 */
export function buildClientsDirectory(
  input: BuildClientsDirectoryInput
): ClientsDirectoryResult {
  const todayYmd =
    input.todayYmd ??
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

  const companyById = new Map<string, ClientDirectoryCompanyInput>();
  for (const c of input.companies) {
    const id = String(c.id ?? "").trim();
    if (!id) continue;
    companyById.set(id, c);
  }

  const contactsByCompany = new Map<string, number>();
  for (const ct of input.contacts ?? []) {
    const cid = String(ct.company_id ?? "").trim();
    if (!cid) continue;
    contactsByCompany.set(cid, (contactsByCompany.get(cid) ?? 0) + 1);
  }

  type Agg = {
    total_billing: number;
    total_debt: number;
    overdue_debt: number;
    debtUYU: number;
    debtUSD: number;
    invoiceCount: number;
    bestName: string | null;
  };

  const aggByCompany = new Map<string, Agg>();
  const invoiceCompanyIds = new Set<string>();
  const invoicesByCompany = new Map<string, ClientDirectoryInvoiceInput[]>();

  for (const inv of input.invoices) {
    if (isVoidedFinancialInvoice(inv as Record<string, unknown>)) continue;
    if (isCreditNoteFromMetadata(inv.zeta_metadata)) continue;
    const companyId = String(inv.company_id ?? "").trim();
    if (!companyId) continue;
    invoiceCompanyIds.add(companyId);

    const list = invoicesByCompany.get(companyId) ?? [];
    list.push(inv);
    invoicesByCompany.set(companyId, list);

    const total = num(inv.total_amount);

    let agg = aggByCompany.get(companyId);
    if (!agg) {
      agg = {
        total_billing: 0,
        total_debt: 0,
        overdue_debt: 0,
        debtUYU: 0,
        debtUSD: 0,
        invoiceCount: 0,
        bestName: null,
      };
      aggByCompany.set(companyId, agg);
    }

    agg.total_billing += total;

    const zetaName = readInvoiceZetaClientName(inv.zeta_metadata);
    if (zetaName && !agg.bestName) agg.bestName = zetaName;
  }

  for (const [companyId, companyInvoices] of invoicesByCompany) {
    const debtTotals = aggregateOperationalDebtForCompany(companyInvoices, {
      todayYmd,
      invoiceBalanceMap: input.invoiceBalanceMap,
    });
    const dedupedSelections = selectOperationalDebtInvoicesForSummation(companyInvoices, {
      invoiceBalanceMap: input.invoiceBalanceMap,
    });

    let agg = aggByCompany.get(companyId);
    if (!agg) {
      agg = {
        total_billing: 0,
        total_debt: 0,
        overdue_debt: 0,
        debtUYU: 0,
        debtUSD: 0,
        invoiceCount: 0,
        bestName: null,
      };
      aggByCompany.set(companyId, agg);
    }

    agg.debtUYU = debtTotals.debtUYU;
    agg.debtUSD = debtTotals.debtUSD;
    agg.total_debt = Math.round((debtTotals.debtUYU + debtTotals.debtUSD) * 100) / 100;
    agg.overdue_debt = Math.round((debtTotals.overdueUYU + debtTotals.overdueUSD) * 100) / 100;
    agg.invoiceCount = dedupedSelections.length;
  }

  let debtors_missing_company_row = 0;
  let debtors_inactive_company_row = 0;
  let debtors_on_invoices = 0;

  for (const [companyId, agg] of aggByCompany) {
    const hasDebt =
      agg.total_debt > PENDING_EPSILON ||
      agg.debtUYU > PENDING_EPSILON ||
      agg.debtUSD > PENDING_EPSILON;
    if (!hasDebt) continue;
    debtors_on_invoices += 1;
    const row = companyById.get(companyId);
    if (!row) debtors_missing_company_row += 1;
    else if (row.is_active === false) debtors_inactive_company_row += 1;
  }

  const allCompanyIds = new Set<string>([
    ...companyById.keys(),
    ...invoiceCompanyIds,
  ]);

  const entries: ClientDirectoryEntry[] = [];

  for (const companyId of allCompanyIds) {
    const company = companyById.get(companyId);
    const agg = aggByCompany.get(companyId);
    const has_contact_record = company != null;
    const contactCount = contactsByCompany.get(companyId) ?? 0;
    const has_contact_data = has_contact_record && contactCount > 0;

    const hasDebt =
      (agg?.total_debt ?? 0) > PENDING_EPSILON ||
      (agg?.debtUYU ?? 0) > PENDING_EPSILON ||
      (agg?.debtUSD ?? 0) > PENDING_EPSILON;

    const derived_from_debt =
      hasDebt && (!has_contact_record || company?.is_active === false);

    let source: ClientDirectorySource = "contact";
    if (has_contact_record && derived_from_debt) source = "merged";
    else if (derived_from_debt) source = "zeta_invoice";

    const name =
      String(company?.name ?? "").trim() ||
      agg?.bestName ||
      shortCompanyLabel(companyId);

    entries.push({
      company_id: companyId,
      name,
      industry: company ? industryOf(company) : "—",
      source,
      has_contact_record,
      has_contact_data,
      derived_from_debt,
      hasDebt,
      debtUYU: agg?.debtUYU ?? 0,
      debtUSD: agg?.debtUSD ?? 0,
      total_debt: Math.round((agg?.total_debt ?? 0) * 100) / 100,
      overdue_debt: Math.round((agg?.overdue_debt ?? 0) * 100) / 100,
      total_billing: Math.round((agg?.total_billing ?? 0) * 100) / 100,
      invoiceCount: agg?.invoiceCount ?? 0,
      receipts_count: input.receiptsByCompany?.get(companyId) ?? 0,
      is_active: company?.is_active ?? null,
    });
  }

  entries.sort((a, b) => {
    if (a.hasDebt !== b.hasDebt) return a.hasDebt ? -1 : 1;
    if (b.total_billing !== a.total_billing) return b.total_billing - a.total_billing;
    return a.name.localeCompare(b.name, "es-UY");
  });

  return {
    entries,
    diagnostics: {
      companies_active_loaded: input.companies.length,
      unique_company_ids_on_invoices: invoiceCompanyIds.size,
      debtors_on_invoices,
      debtors_missing_company_row,
      debtors_inactive_company_row,
      directory_total: entries.length,
    },
  };
}
