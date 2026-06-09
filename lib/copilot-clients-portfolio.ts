import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import {
  buildClientsDirectory,
  type ClientDirectorySource,
  type ClientsDirectoryDiagnostics,
} from "@/lib/copilot-clients-directory";
import {
  buildCurrencyRiskSummary,
  currencyRiskToClientRiskLabel,
} from "@/lib/copilot-financial-thresholds";
import { loadClientPortfolioSourceRows } from "@/lib/data/proto-analytics-read-repository";
import { supabase } from "@/lib/supabase-client";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import {
  selectOperationalDebtInvoicesForSummation,
  type OperationalDebtInvoiceInput,
} from "@/lib/zeta/zeta-operational-debt-dedup";

export type PaymentBehaviorLabel = "bueno" | "medio" | "lento";

export type ClientRiskLabel = "Bajo" | "Medio" | "Alto";

export type ClientPortfolioRow = {
  company_id: string;
  name: string;
  industry: string;
  /** TODO: legacy mixed-currency aggregate — use billing_uyu + billing_usd for per-currency breakdown */
  total_billing: number;
  /** TODO: legacy mixed-currency aggregate — use debt_uyu + debt_usd for per-currency breakdown */
  total_debt: number;
  /** TODO: legacy mixed-currency aggregate — use overdue_uyu + overdue_usd for per-currency breakdown */
  overdue_debt: number;
  invoices_count: number;
  receipts_count: number;
  share_pct: number;
  payment_behavior: PaymentBehaviorLabel;
  risk: ClientRiskLabel;
  /** Origen del registro en el directorio unificado. */
  source: ClientDirectorySource;
  has_contact_data: boolean;
  /** Primer email de contacto ya cargado en portfolio (sin fetch extra). */
  contact_email?: string | null;
  /** Teléfono principal si existe en proto_contacts. */
  contact_phone?: string | null;
  derived_from_debt: boolean;
  debt_uyu: number;
  debt_usd: number;
  /** Fase 1 multi-moneda — campos opcionales; indefinidos si no hay facturas con currency_code reconocido. */
  billing_uyu?: number;
  billing_usd?: number;
  overdue_uyu?: number;
  overdue_usd?: number;
  has_mixed_currency?: boolean;
  /** Días desde el vencimiento de la factura más antigua en mora (UYU). */
  overdue_days_uyu?: number | null;
  /** Días desde el vencimiento de la factura más antigua en mora (USD). */
  overdue_days_usd?: number | null;
  /** Forma de transferencia registrada en Copilot (no proviene de Zeta). */
  transfer_method?: string | null;
  /** Aliases de transferencia activos (de client_transfer_aliases). */
  transferAliases?: string[];
};

export type ClientPortfolioContact = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
};

export type ClientPortfolioInvoice = {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  balance_amount: number;
  status: string;
  currency_code?: string | null;
  /** proto_invoices.category — used to detect shadow `Zeta / saldos pendientes` rows. */
  category?: string | null;
  zeta_metadata?: unknown;
};

export type ClientPortfolioReceipt = {
  id: string;
  amount: number;
  receipt_date: string;
  invoice_id: string | null;
  currency_code?: string | null;
};

export type ClientCompanyDetail = {
  company_id: string;
  company_name: string;
  industry: string;
  contacts: ClientPortfolioContact[];
  invoices: ClientPortfolioInvoice[];
  receipts: ClientPortfolioReceipt[];
  /** TODO: legacy mixed-currency aggregate */
  overdue_debt: number;
  /** TODO: legacy mixed-currency aggregate */
  total_debt: number;
  payment_behavior: PaymentBehaviorLabel;
  risk: ClientRiskLabel;
  share_pct: number;
  /** TODO: legacy mixed-currency aggregate */
  total_billing: number;
  /** Fase 1 multi-moneda — opcionales; propagados desde el directorio y el cálculo de facturas. */
  debt_uyu?: number;
  debt_usd?: number;
  billing_uyu?: number;
  billing_usd?: number;
  overdue_uyu?: number;
  overdue_usd?: number;
  has_mixed_currency?: boolean;
  /** Días desde el vencimiento de la factura más antigua en mora (UYU). */
  overdue_days_uyu?: number | null;
  /** Días desde el vencimiento de la factura más antigua en mora (USD). */
  overdue_days_usd?: number | null;
  /** Forma de transferencia registrada en Copilot (no proviene de Zeta). */
  transfer_method?: string | null;
};

export type ClientPortfolioSummary = {
  top_clients_line: string;
  debt_clients_line: string;
  concentration_line: string;
};

export type ClientPortfolioLoad = {
  rows: ClientPortfolioRow[];
  summary: ClientPortfolioSummary;
  details: Record<string, ClientCompanyDetail>;
  /** Diagnóstico de brecha contacts vs deudores en facturas (auditoría). */
  directory_diagnostics?: ClientsDirectoryDiagnostics;
};

type CompanyRow = {
  id: unknown;
  name: unknown;
  industry?: unknown;
  sector?: unknown;
  transfer_method?: unknown;
};

type InvoiceRow = {
  id: unknown;
  company_id: unknown;
  total_amount: unknown;
  balance_amount: unknown;
  due_date: unknown;
  issue_date: unknown;
  status: unknown;
  invoice_number?: unknown;
  currency_code?: string;
  zeta_metadata?: unknown;
};

type ReceiptRow = {
  id: unknown;
  company_id: unknown;
  amount: unknown;
  receipt_date: unknown;
  invoice_id?: unknown;
  currency_code?: unknown;
};

type ContactRow = {
  id: unknown;
  company_id: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  telefono?: unknown;
  mobile?: unknown;
  title?: unknown;
  role?: unknown;
};

function readContactPhone(ct: ContactRow): string | null {
  for (const raw of [ct.phone, ct.telefono, ct.mobile]) {
    if (raw != null && String(raw).trim()) return String(raw).trim();
  }
  return null;
}

function pickPrimaryContactFields(cts: ContactRow[]): {
  contact_email: string | null;
  contact_phone: string | null;
} {
  let contact_email: string | null = null;
  let contact_phone: string | null = null;
  for (const ct of cts) {
    if (!contact_email && ct.email != null && String(ct.email).trim()) {
      contact_email = String(ct.email).trim();
    }
    if (!contact_phone) {
      contact_phone = readContactPhone(ct);
    }
    if (contact_email && contact_phone) break;
  }
  return { contact_email, contact_phone };
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymd(iso: unknown): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Days since the oldest overdue invoice due_date for a given currency. null if no overdue invoices. */
function oldestOverdueDays(
  invs: readonly InvoiceRow[],
  currency: "UYU" | "USD",
  todayYmd: string
): number | null {
  let oldest: string | null = null;
  for (const inv of invs) {
    if (isCreditNoteFromMetadata(inv.zeta_metadata)) continue;
    const cur = String(inv.currency_code ?? "").trim().toUpperCase();
    if (cur !== currency) continue;
    const pending = num(inv.balance_amount);
    const d = ymd(inv.due_date);
    if (pending > 0 && d && d < todayYmd) {
      if (!oldest || d < oldest) oldest = d;
    }
  }
  if (!oldest) return null;
  const msPerDay = 86_400_000;
  return Math.floor((Date.parse(todayYmd) - Date.parse(oldest)) / msPerDay);
}

function currencyOf(inv: InvoiceRow): "UYU" | "USD" | null {
  const raw = String(inv.currency_code ?? "").trim().toUpperCase();
  if (raw === "UYU" || raw === "USD") return raw as "UYU" | "USD";
  return null;
}

export type InvoiceCurrencyBreakdownInput = {
  currency_code?: string | null;
  total_amount?: unknown;
  balance_amount?: unknown;
  due_date?: unknown;
  /** Metadata Zeta para detectar Notas de Crédito (CFE tipo 112/181/182). */
  zeta_metadata?: unknown;
};

export type InvoiceCurrencyBreakdown = {
  billingUYU: number;
  billingUSD: number;
  overdueUYU: number;
  overdueUSD: number;
  hasMixedCurrency: boolean;
};

/** Desagrega facturación y vencidos por moneda a partir de facturas con currency_code conocido. */
export function computeInvoiceCurrencyBreakdown(
  invs: readonly InvoiceCurrencyBreakdownInput[],
  todayYmd: string
): InvoiceCurrencyBreakdown {
  let billingUYU = 0, billingUSD = 0;
  let overdueUYU = 0, overdueUSD = 0;
  let debtUYU = 0, debtUSD = 0;

  for (const sel of selectOperationalDebtInvoicesForSummation(invs as OperationalDebtInvoiceInput[])) {
    const inv = sel.invoice;
    if (isCreditNoteFromMetadata(inv.zeta_metadata)) continue;
    const cur = currencyOf(inv as InvoiceRow);
    if (!cur) continue;
    const total = num(inv.total_amount);
    const pending = num(inv.balance_amount);
    const d = ymd(inv.due_date);
    const isOverdue = pending > 0 && d !== "" && d < todayYmd;
    if (cur === "UYU") {
      billingUYU += total;
      if (pending > 0) debtUYU += pending;
      if (isOverdue) overdueUYU += pending;
    } else {
      billingUSD += total;
      if (pending > 0) debtUSD += pending;
      if (isOverdue) overdueUSD += pending;
    }
  }

  return {
    billingUYU,
    billingUSD,
    overdueUYU,
    overdueUSD,
    hasMixedCurrency: (billingUYU > 0 && billingUSD > 0) || (debtUYU > 0 && debtUSD > 0),
  };
}

/** Facturas mínimas para clasificar comportamiento de pago (sin I/O). */
export type PortfolioInvoiceBehaviorInput = {
  balance_amount?: unknown;
  status?: unknown;
  due_date?: unknown;
};

export function paymentBehaviorForInvoices(
  invoices: readonly PortfolioInvoiceBehaviorInput[],
  todayYmd: string
): PaymentBehaviorLabel {
  if (invoices.length === 0) return "medio";
  let paidLike = 0;
  let overdue = 0;
  let partial = 0;
  for (const inv of invoices) {
    const bal = num(inv.balance_amount);
    const st = String(inv.status ?? "").toLowerCase().trim();
    const due = ymd(inv.due_date);
    if (bal <= 0 || st === "paid" || st === "cancelled" || st === "void") {
      paidLike += 1;
      continue;
    }
    if (st === "partial") partial += 1;
    if (due && due < todayYmd && bal > 0) overdue += 1;
  }
  const n = invoices.length;
  const overdueRatio = overdue / n;
  const paidRatio = paidLike / n;
  const partialRatio = partial / n;
  if (overdueRatio >= 0.22 || overdueRatio + partialRatio * 0.45 >= 0.38) {
    return "lento";
  }
  if (paidRatio >= 0.52 && overdueRatio <= 0.12) return "bueno";
  return "medio";
}

export function riskForCompany(
  sharePct: number,
  totalDebt: number,
  overdueDebt: number
): ClientRiskLabel {
  const odShare = totalDebt > 0 ? overdueDebt / totalDebt : 0;
  if (
    sharePct >= 0.34 ||
    overdueDebt >= 280_000 ||
    (totalDebt >= 120_000 && odShare >= 0.55)
  ) {
    return "Alto";
  }
  if (sharePct >= 0.16 || totalDebt > 0 || overdueDebt > 0) return "Medio";
  return "Bajo";
}

function maxClientRiskLabel(a: ClientRiskLabel, b: ClientRiskLabel): ClientRiskLabel {
  const order: ClientRiskLabel[] = ["Bajo", "Medio", "Alto"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/**
 * Fase 3: evaluación de riesgo por moneda sin sumar UYU+USD.
 * Evalúa UYU y USD contra thresholds calibrados por moneda.
 * sharePct es currency-agnostic (porcentaje de facturación total).
 */
export function riskForCompanyPerCurrency(
  sharePct: number,
  overdueUyu: number,
  overdueUsd: number,
  debtUyu: number,
  debtUsd: number
): ClientRiskLabel {
  if (sharePct >= 0.34) return "Alto";

  const byCurrency: Partial<Record<"UYU" | "USD", { pending?: number; overdue?: number }>> = {};
  if (debtUyu > 0 || overdueUyu > 0) byCurrency.UYU = { pending: debtUyu, overdue: overdueUyu };
  if (debtUsd > 0 || overdueUsd > 0) byCurrency.USD = { pending: debtUsd, overdue: overdueUsd };

  const summary = buildCurrencyRiskSummary(byCurrency);
  const currencyRisk = currencyRiskToClientRiskLabel(summary.highestRisk);

  const shareRisk: ClientRiskLabel = sharePct >= 0.16 ? "Medio" : "Bajo";
  return maxClientRiskLabel(currencyRisk, shareRisk);
}

function formatPctEs(ratio: number): string {
  return `${(ratio * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

export function buildClientPortfolioSummary(
  rows: ClientPortfolioRow[]
): ClientPortfolioSummary {
  const sorted = [...rows].sort((a, b) => b.total_billing - a.total_billing);
  const top2 = sorted.filter((r) => r.total_billing > 0).slice(0, 2);
  const topShare = top2.reduce((s, r) => s + r.share_pct, 0);
  let top_clients_line: string;
  if (top2.length >= 2) {
    top_clients_line = `${top2[0].name} y ${top2[1].name} concentran el ${formatPctEs(topShare)} de la facturación registrada.`;
  } else if (top2.length === 1) {
    top_clients_line = `${top2[0].name} concentra el ${formatPctEs(top2[0].share_pct)} de la facturación.`;
  } else {
    top_clients_line =
      "Aún no hay facturación registrada por cliente en el prototipo, o los datos están vacíos.";
  }

  const withDebt = rows.filter((r) => r.total_debt > 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdue_debt, 0);
  const overdueSorted = [...rows]
    .filter((r) => r.overdue_debt > 0)
    .sort((a, b) => b.overdue_debt - a.overdue_debt);

  let debt_clients_line: string;
  if (withDebt.length === 0) {
    debt_clients_line =
      "Ningún cliente muestra saldo pendiente en facturas con balance.";
  } else {
    debt_clients_line = `${withDebt.length} cuenta${withDebt.length === 1 ? "" : "s"} con deuda pendiente.`;
    if (totalOverdue > 0 && overdueSorted.length >= 2) {
      const top2o = overdueSorted[0].overdue_debt + overdueSorted[1].overdue_debt;
      const pct = top2o / totalOverdue;
      debt_clients_line += ` El ${formatPctEs(pct)} del vencido está en ${overdueSorted[0].name} y ${overdueSorted[1].name}.`;
    } else if (totalOverdue > 0 && overdueSorted.length === 1) {
      debt_clients_line += ` El vencido se concentra en ${overdueSorted[0].name}.`;
    }
  }

  const hhi = rows.reduce((s, r) => s + r.share_pct * r.share_pct, 0);
  let concentration_line: string;
  if (hhi > 0.22) {
    concentration_line =
      "Concentración alta en pocos clientes: revisá condiciones comerciales y planes de respaldo.";
  } else if (hhi > 0.12) {
    concentration_line =
      "Dependencia moderada del principal cliente; conviene monitoreo periódico de participación.";
  } else {
    concentration_line =
      "Cartera relativamente diversificada en facturación — menor riesgo de concentración.";
  }

  return { top_clients_line, debt_clients_line, concentration_line };
}

function pushMapArray<K, V>(m: Map<K, V[]>, key: K, item: V): void {
  const arr = m.get(key);
  if (arr) arr.push(item);
  else m.set(key, [item]);
}

/**
 * @param client Cliente con sesión válida (`authenticated` + JWT en PostgREST) o service role
 *   acotado por `workspaceCompanyId`. No usar el default en el navegador sin Supabase Auth:
 *   el rol `anon` no tiene GRANT en `proto_*` (sec02-05).
 */
export async function getClientPortfolio(
  client: SupabaseClient = supabase,
  workspaceCompanyId: string
): Promise<ClientPortfolioLoad> {
  const { cRes, iRes, rRes, ctRes } = await loadClientPortfolioSourceRows(
    client,
    workspaceCompanyId
  );

  if (cRes.error) throw new Error(cRes.error.message);
  if (iRes.error) throw new Error(iRes.error.message);
  if (rRes.error) throw new Error(rRes.error.message);

  let companies = (cRes.data ?? []) as CompanyRow[];
  const invoices = (iRes.data ?? []) as InvoiceRow[];
  const receipts = (rRes.data ?? []) as ReceiptRow[];
  const contactsRaw = ctRes.error ? [] : ((ctRes.data ?? []) as ContactRow[]);

  const invoiceCompanyIds = new Set<string>();
  for (const inv of invoices) {
    const cid = String(inv.company_id ?? "").trim();
    if (cid) invoiceCompanyIds.add(cid);
  }

  const knownCompanyIds = new Set(
    companies.map((c) => String(c.id ?? "").trim()).filter(Boolean)
  );
  const missingCompanyIds = [...invoiceCompanyIds].filter((id) => !knownCompanyIds.has(id));
  if (missingCompanyIds.length > 0) {
    const { data: extraCompanies, error: extraErr } = await client
      .from("proto_companies")
      .select("*")
      .eq("workspace_company_id", workspaceCompanyId)
      .in("id", missingCompanyIds.slice(0, 500));
    if (!extraErr && extraCompanies?.length) {
      companies = [...companies, ...(extraCompanies as CompanyRow[])];
    }
  }

  const companiesById = new Map<string, CompanyRow>();
  for (const c of companies) {
    const cid = String(c.id ?? "").trim();
    if (cid) companiesById.set(cid, c);
  }

  const totalBillingAll = invoices.reduce((s, inv) => s + num(inv.total_amount), 0);

  const invoicesByCompany = new Map<string, InvoiceRow[]>();
  for (const inv of invoices) {
    const cid = String(inv.company_id ?? "").trim();
    if (!cid) continue;
    pushMapArray(invoicesByCompany, cid, inv);
  }

  const receiptsByCompany = new Map<string, ReceiptRow[]>();
  const receiptsCountByCompany = new Map<string, number>();
  for (const rec of receipts) {
    const cid = String(rec.company_id ?? "").trim();
    if (!cid) continue;
    pushMapArray(receiptsByCompany, cid, rec);
    receiptsCountByCompany.set(cid, (receiptsCountByCompany.get(cid) ?? 0) + 1);
  }

  const contactsByCompany = new Map<string, ContactRow[]>();
  for (const ct of contactsRaw) {
    const cid = String(ct.company_id ?? "").trim();
    if (!cid) continue;
    pushMapArray(contactsByCompany, cid, ct);
  }

  const todayYmd = localTodayYmd();

  const { entries, diagnostics } = buildClientsDirectory({
    companies: companies.map((c) => ({
      id: String(c.id ?? ""),
      name: c.name != null ? String(c.name) : null,
      industry: c.industry != null ? String(c.industry) : null,
      sector: c.sector != null ? String(c.sector) : null,
      is_active: (c as { is_active?: boolean }).is_active,
    })),
    invoices: invoices.map((inv) => ({
      id: String(inv.id ?? ""),
      company_id:
        inv.company_id != null ? String(inv.company_id) : null,
      invoice_number:
        (inv as { invoice_number?: unknown }).invoice_number != null
          ? String((inv as { invoice_number?: unknown }).invoice_number)
          : null,
      category:
        (inv as { category?: unknown }).category != null
          ? String((inv as { category?: unknown }).category)
          : null,
      total_amount: inv.total_amount,
      balance_amount: inv.balance_amount,
      status: inv.status != null ? String(inv.status) : null,
      due_date: inv.due_date,
      issue_date: inv.issue_date,
      currency_code: inv.currency_code,
      zeta_metadata: (inv as { zeta_metadata?: unknown }).zeta_metadata,
    })),
    contacts: contactsRaw.map((ct) => ({
      company_id: ct.company_id != null ? String(ct.company_id) : null,
    })),
    receiptsByCompany: receiptsCountByCompany,
    todayYmd,
  });

  const rows: ClientPortfolioRow[] = [];
  const details: Record<string, ClientCompanyDetail> = {};

  for (const entry of entries) {
    const company_id = entry.company_id;
    const invs = invoicesByCompany.get(company_id) ?? [];
    const recs = receiptsByCompany.get(company_id) ?? [];
    const cts = contactsByCompany.get(company_id) ?? [];

    const share_pct =
      totalBillingAll > 0 ? entry.total_billing / totalBillingAll : 0;
    const payment_behavior = paymentBehaviorForInvoices(invs, todayYmd);

    const { billingUYU, billingUSD, overdueUYU, overdueUSD, hasMixedCurrency } =
      computeInvoiceCurrencyBreakdown(invs, todayYmd);

    // Fase 3: evaluate risk per-currency when data is available; take the highest severity
    const legacyRisk = riskForCompany(share_pct, entry.total_debt, entry.overdue_debt);
    const hasCurrencyData = entry.debtUYU > 0 || entry.debtUSD > 0 || overdueUYU > 0 || overdueUSD > 0;
    const risk = hasCurrencyData
      ? maxClientRiskLabel(
          legacyRisk,
          riskForCompanyPerCurrency(share_pct, overdueUYU, overdueUSD, entry.debtUYU, entry.debtUSD)
        )
      : legacyRisk;

    const { contact_email, contact_phone } = pickPrimaryContactFields(cts);
    const companyRaw = companiesById.get(company_id);
    const transferMethod =
      companyRaw?.transfer_method != null && String(companyRaw.transfer_method).trim()
        ? String(companyRaw.transfer_method).trim()
        : null;

    const row: ClientPortfolioRow = {
      company_id,
      name: entry.name,
      industry: entry.industry,
      total_billing: entry.total_billing,
      total_debt: entry.total_debt,
      overdue_debt: entry.overdue_debt,
      invoices_count: entry.invoiceCount,
      receipts_count: entry.receipts_count,
      share_pct,
      payment_behavior,
      risk,
      source: entry.source,
      has_contact_data: entry.has_contact_data,
      contact_email,
      contact_phone,
      derived_from_debt: entry.derived_from_debt,
      debt_uyu: entry.debtUYU,
      debt_usd: entry.debtUSD,
      billing_uyu: billingUYU,
      billing_usd: billingUSD,
      overdue_uyu: overdueUYU,
      overdue_usd: overdueUSD,
      has_mixed_currency: hasMixedCurrency,
      overdue_days_uyu: overdueUYU > 0 ? oldestOverdueDays(invs, "UYU", todayYmd) : null,
      overdue_days_usd: overdueUSD > 0 ? oldestOverdueDays(invs, "USD", todayYmd) : null,
      transfer_method: transferMethod,
    };
    rows.push(row);

    const contacts: ClientPortfolioContact[] = cts.map((ct) => ({
      id: String(ct.id ?? ""),
      name: String(ct.name ?? "").trim() || "Sin nombre",
      email: ct.email != null && String(ct.email).trim() ? String(ct.email) : null,
      title:
        ct.title != null && String(ct.title).trim()
          ? String(ct.title)
          : ct.role != null && String(ct.role).trim()
            ? String(ct.role)
            : null,
    }));

    const invOut: ClientPortfolioInvoice[] = [...invs]
      .sort((a, b) => ymd(b.issue_date).localeCompare(ymd(a.issue_date)))
      .map((inv) => ({
        id: String(inv.id ?? ""),
        invoice_number: String(inv.invoice_number ?? inv.id ?? "").trim() || "—",
        issue_date: ymd(inv.issue_date) || "—",
        due_date: ymd(inv.due_date) || "—",
        total_amount: num(inv.total_amount),
        balance_amount: num(inv.balance_amount),
        status: String(inv.status ?? "").trim() || "—",
        currency_code: inv.currency_code ?? null,
        category: (inv as { category?: unknown }).category != null
          ? String((inv as { category?: unknown }).category)
          : null,
        zeta_metadata: (inv as { zeta_metadata?: unknown }).zeta_metadata,
      }));

    const recOut: ClientPortfolioReceipt[] = [...recs]
      .sort((a, b) => ymd(b.receipt_date).localeCompare(ymd(a.receipt_date)))
      .map((r) => ({
        id: String(r.id ?? ""),
        amount: num(r.amount),
        receipt_date: ymd(r.receipt_date) || "—",
        invoice_id:
          r.invoice_id != null && String(r.invoice_id).trim()
            ? String(r.invoice_id)
            : null,
        currency_code: r.currency_code != null
          ? String(r.currency_code).trim().toUpperCase() || null
          : null,
      }));

    details[company_id] = {
      company_id,
      company_name: entry.name,
      industry: entry.industry,
      contacts,
      invoices: invOut,
      receipts: recOut,
      overdue_debt: entry.overdue_debt,
      total_debt: entry.total_debt,
      payment_behavior,
      risk,
      share_pct,
      total_billing: entry.total_billing,
      debt_uyu: entry.debtUYU,
      debt_usd: entry.debtUSD,
      billing_uyu: billingUYU,
      billing_usd: billingUSD,
      overdue_uyu: overdueUYU,
      overdue_usd: overdueUSD,
      has_mixed_currency: hasMixedCurrency,
      transfer_method: transferMethod,
    };
  }

  return {
    rows,
    summary: buildClientPortfolioSummary(rows),
    details,
    directory_diagnostics: diagnostics,
  };
}

export function clientRiskToCopilotSeverity(
  r: ClientRiskLabel
): "low" | "medium" | "high" {
  if (r === "Alto") return "high";
  if (r === "Medio") return "medium";
  return "low";
}

export function paymentBehaviorLabelEs(b: PaymentBehaviorLabel): string {
  if (b === "bueno") return "Bueno";
  if (b === "lento") return "Lento";
  return "Medio";
}

/**
 * Formatea un monto para la vista de portfolio.
 * Si se pasa `currency`, usa el símbolo correcto (UYU→"$", USD→"U$S").
 *
 * Legacy: total_billing / total_debt / overdue_debt siguen en el modelo por compatibilidad
 * interna, pero la UI visible no debe mostrarlos (son agregados mixtos UYU+USD).
 */
export function formatMoneyPortfolio(n: number, currency?: string | null): string {
  return formatMoneyCurrency(n, currency);
}
