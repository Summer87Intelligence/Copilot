/**
 * Payment Behavior Source
 *
 * Maps current Supabase/proto data to the pure engine input types.
 * Responsible for: DB queries, normalization, client name resolution.
 * Does NOT contain projection logic — that lives in payment-behavior-engine.ts.
 *
 * Design:
 *   - One batch read per table (no per-client queries)
 *   - Reuses existing patterns from proto-analytics-read-repository
 *   - Falls back gracefully if zeta_metadata or other optional fields are absent
 */

import { toSafeNumber } from "@/lib/copilot-numeric-parse";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { COPILOT_OPERATIONAL_START_DATE } from "@/lib/copilot-operational-period";
import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type {
  PaymentBehaviorInvoice,
  PaymentBehaviorReceipt,
  PaymentBehaviorCurrency,
} from "@/lib/payment-behavior/payment-behavior-engine";

const PAYMENT_BEHAVIOR_ROW_CAP = 5000;
const VOIDED_STATUSES = new Set(["void", "voided", "canceled", "cancelled", "anulada", "anulado"]);

function normalizeCurrency(raw: unknown): PaymentBehaviorCurrency | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "USD" || s === "UYU") return s;
  return null;
}

function isVoidedStatus(status: unknown): boolean {
  return VOIDED_STATUSES.has(String(status ?? "").toLowerCase());
}

function ymd(v: unknown): string | null {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export type PaymentBehaviorDataBundle = {
  invoices: PaymentBehaviorInvoice[];
  receipts: PaymentBehaviorReceipt[];
};

/**
 * Loads invoices + receipts for the payment behavior engine in a single batch.
 *
 * Notes:
 *  - Company names are resolved via a join on proto_companies (one query).
 *  - Voided invoices and credit notes are kept so the engine can exclude them.
 *  - All amounts parsed via toSafeNumber to handle Postgres numeric-as-string.
 */
export async function loadPaymentBehaviorData(
  client: OperationalSupabase,
  workspaceCompanyId: string
): Promise<PaymentBehaviorDataBundle> {
  const wid = workspaceCompanyId.trim();
  if (!wid) throw new Error("[payment-behavior-source] workspaceCompanyId requerido");

  // 1. Load invoices with necessary fields
  const { data: rawInvoices, error: invErr } = await client
    .from("proto_invoices")
    .select(
      "id, company_id, issue_date, due_date, total_amount, balance_amount, " +
      "currency_code, status, is_active, zeta_metadata, invoice_number"
    )
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .gte("issue_date", COPILOT_OPERATIONAL_START_DATE)
    .order("issue_date", { ascending: false })
    .limit(PAYMENT_BEHAVIOR_ROW_CAP);

  if (invErr) throw new Error(`[payment-behavior-source] invoices: ${invErr.message}`);

  // 2. Load receipts
  const { data: rawReceipts, error: recErr } = await client
    .from("proto_receipts")
    .select("id, company_id, currency_code, amount, receipt_date, status, receipt_number")
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .gte("receipt_date", COPILOT_OPERATIONAL_START_DATE)
    .order("receipt_date", { ascending: false })
    .limit(PAYMENT_BEHAVIOR_ROW_CAP);

  if (recErr) throw new Error(`[payment-behavior-source] receipts: ${recErr.message}`);

  // 3. Resolve company names in one batch
  const allCompanyIds = new Set<string>();
  for (const row of (rawInvoices ?? []) as unknown as Record<string, unknown>[]) {
    if (row.company_id) allCompanyIds.add(String(row.company_id));
  }
  for (const row of (rawReceipts ?? []) as unknown as Record<string, unknown>[]) {
    if (row.company_id) allCompanyIds.add(String(row.company_id));
  }

  const companyNames: Map<string, string> = new Map();
  if (allCompanyIds.size > 0) {
    const { data: companies } = await client
      .from("proto_companies")
      .select("id, name")
      .eq("workspace_company_id", wid)
      .in("id", [...allCompanyIds].slice(0, 500));

    for (const c of (companies ?? []) as unknown as Record<string, unknown>[]) {
      if (c.id && c.name) companyNames.set(String(c.id), String(c.name));
    }
  }

  // 4. Map invoices
  const invoices: PaymentBehaviorInvoice[] = [];
  for (const row of (rawInvoices ?? []) as unknown as Record<string, unknown>[]) {
    const currency = normalizeCurrency(row.currency_code);
    if (!currency) continue;

    const invoiceId = String(row.id ?? "").trim();
    if (!invoiceId) continue;

    const clientId = row.company_id ? String(row.company_id).trim() : null;
    if (!clientId) continue; // Skip unlinked invoices

    const issueDate = ymd(row.issue_date);
    if (!issueDate) continue;

    const totalAmount = toSafeNumber(row.total_amount) ?? 0;
    const balanceAmount = toSafeNumber(row.balance_amount) ?? 0;

    const isVoided = isVoidedStatus(row.status) || row.is_active === false;
    const isCreditNote = isCreditNoteFromMetadata(row.zeta_metadata);

    invoices.push({
      invoiceId,
      clientId,
      clientName: companyNames.get(clientId) ?? clientId,
      currency,
      issueDate,
      dueDate: ymd(row.due_date),
      totalAmount,
      balanceAmount: Math.max(0, balanceAmount),
      isCreditNote,
      isVoided,
    });
  }

  // 5. Map receipts
  const receipts: PaymentBehaviorReceipt[] = [];
  for (const row of (rawReceipts ?? []) as unknown as Record<string, unknown>[]) {
    const currency = normalizeCurrency(row.currency_code);
    if (!currency) continue;

    if (isVoidedStatus(row.status)) continue;

    const receiptId = String(row.id ?? "").trim();
    if (!receiptId) continue;

    const clientId = row.company_id ? String(row.company_id).trim() : null;
    if (!clientId) continue; // Only matched receipts contribute to client profiles

    const receiptDate = ymd(row.receipt_date);
    if (!receiptDate) continue;

    const amount = toSafeNumber(row.amount) ?? 0;
    if (amount <= 0) continue;

    receipts.push({
      receiptId,
      clientId,
      currency,
      amount,
      receiptDate,
      appliedInvoiceId: null, // DIV-CONT-005: not available from Zeta
    });
  }

  return { invoices, receipts };
}
