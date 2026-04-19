import type { SupabaseClient } from "@supabase/supabase-js";

import { loadClientPortfolioSourceRows } from "@/lib/data/proto-analytics-read-repository";
import { supabase } from "@/lib/supabase-client";

export type PaymentBehaviorLabel = "bueno" | "medio" | "lento";

export type ClientRiskLabel = "Bajo" | "Medio" | "Alto";

export type ClientPortfolioRow = {
  company_id: string;
  name: string;
  industry: string;
  total_billing: number;
  total_debt: number;
  overdue_debt: number;
  invoices_count: number;
  receipts_count: number;
  share_pct: number;
  payment_behavior: PaymentBehaviorLabel;
  risk: ClientRiskLabel;
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
};

export type ClientPortfolioReceipt = {
  id: string;
  amount: number;
  receipt_date: string;
  invoice_id: string | null;
};

export type ClientCompanyDetail = {
  company_id: string;
  company_name: string;
  industry: string;
  contacts: ClientPortfolioContact[];
  invoices: ClientPortfolioInvoice[];
  receipts: ClientPortfolioReceipt[];
  overdue_debt: number;
  total_debt: number;
  payment_behavior: PaymentBehaviorLabel;
  risk: ClientRiskLabel;
  share_pct: number;
  total_billing: number;
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
};

type CompanyRow = {
  id: unknown;
  name: unknown;
  industry?: unknown;
  sector?: unknown;
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
};

type ReceiptRow = {
  id: unknown;
  company_id: unknown;
  amount: unknown;
  receipt_date: unknown;
  invoice_id?: unknown;
};

type ContactRow = {
  id: unknown;
  company_id: unknown;
  name?: unknown;
  email?: unknown;
  title?: unknown;
  role?: unknown;
};

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

function industryOf(c: CompanyRow): string {
  const raw = c.industry ?? c.sector ?? "";
  const s = String(raw).trim();
  return s || "—";
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

export async function getClientPortfolio(
  client: SupabaseClient = supabase,
  workspaceCompanyId?: string
): Promise<ClientPortfolioLoad> {
  const { cRes, iRes, rRes, ctRes } = await loadClientPortfolioSourceRows(
    client,
    workspaceCompanyId
  );

  if (cRes.error) throw new Error(cRes.error.message);
  if (iRes.error) throw new Error(iRes.error.message);
  if (rRes.error) throw new Error(rRes.error.message);

  const companies = (cRes.data ?? []) as CompanyRow[];
  const invoices = (iRes.data ?? []) as InvoiceRow[];
  const receipts = (rRes.data ?? []) as ReceiptRow[];
  const contactsRaw = ctRes.error ? [] : ((ctRes.data ?? []) as ContactRow[]);

  const totalBillingAll = invoices.reduce((s, inv) => s + num(inv.total_amount), 0);

  const invoicesByCompany = new Map<string, InvoiceRow[]>();
  for (const inv of invoices) {
    const cid = String(inv.company_id ?? "").trim();
    if (!cid) continue;
    pushMapArray(invoicesByCompany, cid, inv);
  }

  const receiptsByCompany = new Map<string, ReceiptRow[]>();
  for (const rec of receipts) {
    const cid = String(rec.company_id ?? "").trim();
    if (!cid) continue;
    pushMapArray(receiptsByCompany, cid, rec);
  }

  const contactsByCompany = new Map<string, ContactRow[]>();
  for (const ct of contactsRaw) {
    const cid = String(ct.company_id ?? "").trim();
    if (!cid) continue;
    pushMapArray(contactsByCompany, cid, ct);
  }

  const todayYmd = localTodayYmd();
  const rows: ClientPortfolioRow[] = [];
  const details: Record<string, ClientCompanyDetail> = {};

  for (const c of companies) {
    const company_id = String(c.id ?? "").trim();
    if (!company_id) continue;

    const name = String(c.name ?? "").trim() || "Sin nombre";
    const industry = industryOf(c);
    const invs = invoicesByCompany.get(company_id) ?? [];
    const recs = receiptsByCompany.get(company_id) ?? [];
    const cts = contactsByCompany.get(company_id) ?? [];

    let total_billing = 0;
    let total_debt = 0;
    let overdue_debt = 0;

    for (const inv of invs) {
      total_billing += num(inv.total_amount);
      const bal = num(inv.balance_amount);
      total_debt += bal;
      const due = ymd(inv.due_date);
      if (bal > 0 && due && due < todayYmd) {
        overdue_debt += bal;
      }
    }

    const share_pct = totalBillingAll > 0 ? total_billing / totalBillingAll : 0;
    const payment_behavior = paymentBehaviorForInvoices(invs, todayYmd);
    const risk = riskForCompany(share_pct, total_debt, overdue_debt);

    const row: ClientPortfolioRow = {
      company_id,
      name,
      industry,
      total_billing,
      total_debt,
      overdue_debt,
      invoices_count: invs.length,
      receipts_count: recs.length,
      share_pct,
      payment_behavior,
      risk,
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
      }));

    details[company_id] = {
      company_id,
      company_name: name,
      industry,
      contacts,
      invoices: invOut,
      receipts: recOut,
      overdue_debt,
      total_debt,
      payment_behavior,
      risk,
      share_pct,
      total_billing,
    };
  }

  rows.sort((a, b) => b.total_billing - a.total_billing);

  return {
    rows,
    summary: buildClientPortfolioSummary(rows),
    details,
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

export function formatMoneyPortfolio(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}
