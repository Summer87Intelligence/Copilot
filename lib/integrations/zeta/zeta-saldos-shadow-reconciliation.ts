/**
 * FASE 1 — Cierre automático de shadows `Zeta / saldos pendientes` cuando el CCV1
 * emparejado ya está en saldo 0. No altera métricas operativas (dedupe ya excluye shadows).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { protoUpdateInvoice } from "@/lib/copilot-proto-crud-service";
import {
  generateFinancialConsistencyReport,
  invoiceInputFromProtoRow,
  type InvoiceInput,
} from "@/lib/copilot-financial-reconciliation";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { createLogger } from "@/lib/observability/logger";
import { maybeLogZetaBalanceWriteAfterUpdate } from "@/lib/integrations/zeta/zeta-balance-write-diag";
import { INSTALLMENT_SALDO_EPSILON } from "@/lib/integrations/zeta/zeta-installment-guard";
import {
  buildOrphanResolvedMetadataPatch,
  ORPHAN_RESOLVED_REASONS,
} from "@/lib/integrations/zeta/zeta-orphan-auto-repair";
import {
  extractRegistroIdsFromInvoiceZetaMetadata,
  parseZetaLegacyRegistroIdFromInvoiceNumber,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";
import {
  fetchOpenCuotaKeysFromZeta,
  prepareInvoiceCloseAfterStaleInstallmentCleanup,
} from "@/lib/integrations/zeta/zeta-stale-installment-cleanup";
import {
  isZetaSaldosPendientesShadowRow,
  readOperationalDebtInvoiceCurrency,
  type OperationalDebtInvoiceInput,
} from "@/lib/zeta/zeta-operational-debt-dedup";

const _log = createLogger({ source: "zeta_saldos_shadow_reconcile" });

export const SHADOW_RECONCILE_EPSILON = 0.005;

const VOIDED_STATUSES = new Set([
  "paid",
  "void",
  "voided",
  "canceled",
  "cancelled",
  "anulada",
  "anulado",
  "annulled",
  "annul",
]);

export type ShadowPairSkipReason =
  | "shadow_ineligible"
  | "no_ccv1_pair"
  | "ambiguous_registro"
  | "ambiguous_fallback"
  | "ambiguous_balance"
  | "ccv1_void"
  | "ccv1_still_open"
  | "blocked_by_installments"
  | "blocked_by_open_zeta_cuota"
  | "feature_disabled"
  | "dry_run";

export type ShadowPairResult = {
  shadow: OperationalDebtInvoiceInput;
  real: OperationalDebtInvoiceInput | null;
  pair_reason: string | null;
  skip_reason: ShadowPairSkipReason | null;
};

export type ShadowReconcileCandidate = {
  shadow_id: string;
  shadow_invoice_number: string;
  shadow_balance: number;
  shadow_currency: string;
  company_id: string;
  ccv1_id: string;
  ccv1_invoice_number: string;
  ccv1_balance: number;
  pair_reason: string;
};

export type ShadowReconcileRunResult = {
  shadows_scanned: number;
  closed_count: number;
  closed: ShadowReconcileCandidate[];
  skipped: { shadow_id: string; invoice_number: string; reason: ShadowPairSkipReason }[];
  db_errors: number;
  dry_run: boolean;
};

export function isZetaSaldosShadowReconcileEnabled(): boolean {
  const raw = process.env.ZETA_SALDOS_SHADOW_RECONCILE?.trim();
  if (raw === "0" || raw?.toLowerCase() === "false") return false;
  return true;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function roundShadowAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

function ymd(iso: unknown): string {
  const s = String(iso ?? "").trim();
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function isRealCcv1(inv: OperationalDebtInvoiceInput): boolean {
  return String(inv.invoice_number ?? "").startsWith("ZETA:CCV1:");
}

function pendingBalance(inv: OperationalDebtInvoiceInput): number {
  return Math.max(0, num(inv.balance_amount));
}

function realHasRegistroId(inv: OperationalDebtInvoiceInput, registroId: string): boolean {
  return extractRegistroIdsFromInvoiceZetaMetadata(inv.zeta_metadata).includes(registroId);
}

function totalsWithinTolerance(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff <= Math.max(0.01, 1e-4 * Math.max(Math.abs(a), Math.abs(b)));
}

/** Empareja shadow ↔ CCV1 con reglas estrictas FASE 1 (exportado para tests). */
export function pairShadowToRealStrict(
  shadow: OperationalDebtInvoiceInput,
  reals: OperationalDebtInvoiceInput[]
): ShadowPairResult {
  const shadowId = String(shadow.id ?? "").trim();
  const shadowCompany = String(shadow.company_id ?? "").trim();
  const shadowCur = readOperationalDebtInvoiceCurrency(shadow);
  const shadowBal = pendingBalance(shadow);
  const shadowIssue = ymd(shadow.issue_date);
  const registroId = parseZetaLegacyRegistroIdFromInvoiceNumber(String(shadow.invoice_number ?? ""));

  if (!shadowId || !shadowCompany || !shadowCur || !(shadowBal > SHADOW_RECONCILE_EPSILON)) {
    return { shadow, real: null, pair_reason: null, skip_reason: "shadow_ineligible" };
  }

  const companyReals = reals.filter(
    (r) =>
      String(r.company_id ?? "").trim() === shadowCompany &&
      isRealCcv1(r) &&
      readOperationalDebtInvoiceCurrency(r) === shadowCur
  );

  let pairReason: string | null = null;
  let matched: OperationalDebtInvoiceInput | null = null;

  if (registroId) {
    const metaMatches = companyReals.filter((r) => realHasRegistroId(r, registroId));
    if (metaMatches.length === 1) {
      matched = metaMatches[0]!;
      pairReason = "registro_metadata";
    } else if (metaMatches.length > 1) {
      return { shadow, real: null, pair_reason: null, skip_reason: "ambiguous_registro" };
    } else {
      const fallback = companyReals.filter((r) => {
        if (shadowIssue && ymd(r.issue_date) !== shadowIssue) return false;
        const rb = pendingBalance(r);
        const rt = roundShadowAmount(num(r.total_amount));
        return (
          totalsWithinTolerance(rb, shadowBal) ||
          totalsWithinTolerance(rt, shadowBal) ||
          totalsWithinTolerance(rt, num(shadow.total_amount))
        );
      });
      if (fallback.length === 1) {
        matched = fallback[0]!;
        pairReason = "registro_fallback";
      } else if (fallback.length > 1) {
        return { shadow, real: null, pair_reason: null, skip_reason: "ambiguous_fallback" };
      }
    }
  }

  if (!matched) {
    const balanceMatches = companyReals.filter((r) => {
      const rb = pendingBalance(r);
      const rt = roundShadowAmount(num(r.total_amount));
      return (
        totalsWithinTolerance(rb, shadowBal) ||
        totalsWithinTolerance(rt, shadowBal) ||
        totalsWithinTolerance(rt, num(shadow.total_amount))
      );
    });
    if (balanceMatches.length === 1) {
      matched = balanceMatches[0]!;
      pairReason = "balance_unique";
    } else if (balanceMatches.length > 1) {
      return { shadow, real: null, pair_reason: null, skip_reason: "ambiguous_balance" };
    } else {
      return { shadow, real: null, pair_reason: null, skip_reason: "no_ccv1_pair" };
    }
  }

  const realSt = String(matched.status ?? "").trim().toLowerCase();
  if (VOIDED_STATUSES.has(realSt) && realSt !== "paid") {
    return { shadow, real: matched, pair_reason: pairReason, skip_reason: "ccv1_void" };
  }

  if (pendingBalance(matched) > SHADOW_RECONCILE_EPSILON) {
    return { shadow, real: matched, pair_reason: pairReason, skip_reason: "ccv1_still_open" };
  }

  return { shadow, real: matched, pair_reason: pairReason, skip_reason: null };
}

export function classifyShadowCandidatesForCompany(
  companyInvoices: readonly OperationalDebtInvoiceInput[]
): { candidates: ShadowReconcileCandidate[]; skipped: ShadowPairResult[] } {
  const shadows = companyInvoices.filter(
    (inv) =>
      isZetaSaldosPendientesShadowRow(inv) &&
      pendingBalance(inv) > SHADOW_RECONCILE_EPSILON &&
      !isCreditNoteFromMetadata(inv.zeta_metadata)
  );
  const reals = companyInvoices.filter((inv) => isRealCcv1(inv));
  const candidates: ShadowReconcileCandidate[] = [];
  const skipped: ShadowPairResult[] = [];

  for (const shadow of shadows) {
    const st = String(shadow.status ?? "").trim().toLowerCase();
    if (VOIDED_STATUSES.has(st)) continue;

    const pair = pairShadowToRealStrict(shadow, reals);
    if (pair.skip_reason || !pair.real || !pair.pair_reason) {
      skipped.push(pair);
      continue;
    }

    const cur = readOperationalDebtInvoiceCurrency(shadow) ?? "?";
    candidates.push({
      shadow_id: String(shadow.id),
      shadow_invoice_number: String(shadow.invoice_number ?? ""),
      shadow_balance: roundShadowAmount(pendingBalance(shadow)),
      shadow_currency: cur,
      company_id: String(shadow.company_id ?? ""),
      ccv1_id: String(pair.real.id),
      ccv1_invoice_number: String(pair.real.invoice_number ?? ""),
      ccv1_balance: roundShadowAmount(pendingBalance(pair.real)),
      pair_reason: pair.pair_reason,
    });
  }

  return { candidates, skipped };
}

export function computeWorkspacePendingAtCutoff(
  invoices: readonly InvoiceInput[],
  workspaceId = "shadow-reconcile"
): { uyu: number; usd: number } {
  const report = generateFinancialConsistencyReport({
    workspaceId,
    invoices: [...invoices],
    companies: [],
    receipts: [],
    syncStates: [],
    mode: "all_outstanding",
  });
  const uyu = report.currencies.find((c) => c.currencyCode === "UYU")?.pendingAtCutoff ?? 0;
  const usd = report.currencies.find((c) => c.currencyCode === "USD")?.pendingAtCutoff ?? 0;
  return { uyu: roundShadowAmount(uyu), usd: roundShadowAmount(usd) };
}

async function closeShadowInvoice(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  shadow: OperationalDebtInvoiceInput,
  candidate: ShadowReconcileCandidate,
  opts: {
    syncRunId?: string;
    requestId?: string;
    clienteCodigo?: string;
    tenantId?: string;
    touchedInvoiceIds?: Set<string>;
    now?: string;
  }
): Promise<{ ok: boolean; skip_reason?: ShadowPairSkipReason }> {
  const wid = workspaceCompanyId.trim();
  const shadowId = String(shadow.id ?? "").trim();
  const invoiceNumber = String(shadow.invoice_number ?? "");
  const prevBal = pendingBalance(shadow);
  const prevStatus = String(shadow.status ?? "issued");

  const openCuotaKeysFromZeta =
    opts.clienteCodigo && opts.tenantId && opts.syncRunId && opts.requestId
      ? await fetchOpenCuotaKeysFromZeta(
          {
            requestId: opts.requestId,
            tenantId: opts.tenantId,
            syncRunId: opts.syncRunId,
          },
          opts.clienteCodigo
        )
      : null;

  const { installmentSaldo, cleanup } = await prepareInvoiceCloseAfterStaleInstallmentCleanup(
    supabase,
    {
      workspaceCompanyId: wid,
      invoiceId: shadowId,
      invoiceNumber,
      clienteCodigo: opts.clienteCodigo ?? "unknown",
      touchedInvoiceIds: opts.touchedInvoiceIds ?? new Set<string>(),
      openCuotaKeysFromZeta,
      syncRunId: opts.syncRunId,
    }
  );

  if (installmentSaldo === null || installmentSaldo > INSTALLMENT_SALDO_EPSILON) {
    return {
      ok: false,
      skip_reason: cleanup.blocked_by_open_zeta_cuota
        ? "blocked_by_open_zeta_cuota"
        : "blocked_by_installments",
    };
  }

  const now = opts.now ?? new Date().toISOString();
  const closedMeta = buildOrphanResolvedMetadataPatch(
    shadow.zeta_metadata,
    ORPHAN_RESOLVED_REASONS.SHADOW_SUPERSEDED_BY_CCV1,
    now
  );

  const { error: metaErr } = await supabase
    .from("proto_invoices")
    .update({ zeta_metadata: closedMeta })
    .eq("id", shadowId)
    .eq("workspace_company_id", wid);

  if (metaErr) {
    _log.warn("zeta_shadow_reconcile_meta_error", {
      invoice_id: shadowId,
      message: metaErr.message,
    });
    return { ok: false };
  }

  const up = await protoUpdateInvoice(
    supabase,
    shadowId,
    { balance_amount: 0, status: "paid" },
    wid,
    { allowBalanceGtTotal: true }
  );

  if (!up.ok) {
    _log.warn("zeta_shadow_reconcile_close_error", {
      invoice_id: shadowId,
      message: up.message,
    });
    return { ok: false };
  }

  await maybeLogZetaBalanceWriteAfterUpdate(supabase, wid, shadowId, invoiceNumber, {
    source: "saldos_shadow_reconcile",
    writer_process: "reconcileStaleSaldosShadowsForClient",
    balance_payload: 0,
    beforeSnap: {
      balance_amount: prevBal,
      status: prevStatus,
      invoice_number: invoiceNumber,
    },
    up,
  });

  _log.info("zeta_shadow_reconciled", {
    shadow_id: shadowId,
    shadow_invoice_number: invoiceNumber,
    ccv1_id: candidate.ccv1_id,
    ccv1_invoice_number: candidate.ccv1_invoice_number,
    shadow_balance_closed: prevBal,
    pair_reason: candidate.pair_reason,
    sync_run_id: opts.syncRunId ?? null,
  });

  return { ok: true };
}

async function loadCompanyOperationalInvoices(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string
): Promise<OperationalDebtInvoiceInput[]> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select(
      "id, company_id, invoice_number, balance_amount, total_amount, currency_code, status, issue_date, due_date, due_date_source, category, zeta_metadata"
    )
    .eq("workspace_company_id", workspaceCompanyId.trim())
    .eq("company_id", protoCompanyId)
    .eq("is_active", true)
    .gte("issue_date", MIN_FINANCIAL_DATE);

  if (error) throw new Error(`loadCompanyOperationalInvoices: ${error.message}`);
  return (data ?? []).map((row) => invoiceRowToOperationalInput(row as Record<string, unknown>));
}

export async function reconcileStaleSaldosShadowsForClient(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string,
  companyInvoices?: readonly OperationalDebtInvoiceInput[],
  opts: {
    syncRunId?: string;
    requestId?: string;
    clienteCodigo?: string;
    tenantId?: string;
    touchedInvoiceIds?: Set<string>;
    dryRun?: boolean;
    now?: string;
  } = {}
): Promise<ShadowReconcileRunResult> {
  const result: ShadowReconcileRunResult = {
    shadows_scanned: 0,
    closed_count: 0,
    closed: [],
    skipped: [],
    db_errors: 0,
    dry_run: Boolean(opts.dryRun),
  };

  if (!isZetaSaldosShadowReconcileEnabled()) {
    return result;
  }

  const loaded =
    companyInvoices && companyInvoices.length > 0
      ? [...companyInvoices]
      : await loadCompanyOperationalInvoices(supabase, workspaceCompanyId, protoCompanyId);

  const scoped = loaded.filter(
    (inv) => String(inv.company_id ?? "").trim() === protoCompanyId.trim()
  );
  const { candidates, skipped } = classifyShadowCandidatesForCompany(scoped);
  result.shadows_scanned = scoped.filter(
    (inv) =>
      isZetaSaldosPendientesShadowRow(inv) && pendingBalance(inv) > SHADOW_RECONCILE_EPSILON
  ).length;

  for (const s of skipped) {
    if (!s.skip_reason) continue;
    result.skipped.push({
      shadow_id: String(s.shadow.id ?? ""),
      invoice_number: String(s.shadow.invoice_number ?? ""),
      reason: s.skip_reason,
    });
  }

  if (opts.dryRun) {
    result.closed = candidates;
    result.closed_count = candidates.length;
    return result;
  }

  const shadowById = new Map(
    scoped.map((inv) => [String(inv.id ?? ""), inv] as const)
  );

  for (const candidate of candidates) {
    const shadow = shadowById.get(candidate.shadow_id);
    if (!shadow) continue;
    const close = await closeShadowInvoice(supabase, workspaceCompanyId, shadow, candidate, opts);
    if (close.ok) {
      result.closed.push(candidate);
      result.closed_count += 1;
    } else if (close.skip_reason) {
      result.skipped.push({
        shadow_id: candidate.shadow_id,
        invoice_number: candidate.shadow_invoice_number,
        reason: close.skip_reason,
      });
    } else {
      result.db_errors += 1;
    }
  }

  return result;
}

/**
 * Hook preventivo: tras actualizar CCV1 por saldos, cerrar shadow legacy emparejado
 * si CCV1 quedó en saldo 0 y el par es único (misma regla FASE 1).
 */
export async function maybeCloseShadowSupersededByCcv1(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string,
  ccv1Invoice: OperationalDebtInvoiceInput,
  opts: {
    syncRunId?: string;
    requestId?: string;
    clienteCodigo?: string;
    tenantId?: string;
    touchedInvoiceIds?: Set<string>;
  }
): Promise<boolean> {
  if (!isZetaSaldosShadowReconcileEnabled()) return false;
  if (!isRealCcv1(ccv1Invoice)) return false;
  if (pendingBalance(ccv1Invoice) > SHADOW_RECONCILE_EPSILON) return false;

  const wid = workspaceCompanyId.trim();
  const { data, error } = await supabase
    .from("proto_invoices")
    .select(
      "id, company_id, invoice_number, balance_amount, total_amount, currency_code, status, issue_date, due_date, due_date_source, category, zeta_metadata"
    )
    .eq("workspace_company_id", wid)
    .eq("company_id", protoCompanyId)
    .eq("is_active", true)
    .gte("issue_date", MIN_FINANCIAL_DATE)
    .eq("category", "Zeta / saldos pendientes")
    .gt("balance_amount", SHADOW_RECONCILE_EPSILON);

  if (error || !data?.length) return false;

  const shadows = (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    company_id: row.company_id != null ? String(row.company_id) : null,
    invoice_number: row.invoice_number != null ? String(row.invoice_number) : null,
    balance_amount: row.balance_amount,
    total_amount: row.total_amount,
    currency_code: row.currency_code != null ? String(row.currency_code) : null,
    status: row.status != null ? String(row.status) : null,
    issue_date: row.issue_date != null ? String(row.issue_date) : null,
    due_date: row.due_date != null ? String(row.due_date) : null,
    due_date_source: row.due_date_source != null ? String(row.due_date_source) : null,
    category: row.category != null ? String(row.category) : null,
    zeta_metadata: row.zeta_metadata ?? null,
  }));

  for (const shadow of shadows) {
    const p = pairShadowToRealStrict(shadow, [ccv1Invoice]);
    if (p.skip_reason || !p.real || !p.pair_reason) continue;
    const candidate: ShadowReconcileCandidate = {
      shadow_id: String(shadow.id),
      shadow_invoice_number: String(shadow.invoice_number ?? ""),
      shadow_balance: roundShadowAmount(pendingBalance(shadow)),
      shadow_currency: readOperationalDebtInvoiceCurrency(shadow) ?? "?",
      company_id: String(shadow.company_id ?? ""),
      ccv1_id: String(ccv1Invoice.id ?? ""),
      ccv1_invoice_number: String(ccv1Invoice.invoice_number ?? ""),
      ccv1_balance: roundShadowAmount(pendingBalance(ccv1Invoice)),
      pair_reason: p.pair_reason,
    };
    const close = await closeShadowInvoice(supabase, workspaceCompanyId, shadow, candidate, opts);
    if (close.ok) return true;
  }

  return false;
}

export function invoiceRowToOperationalInput(
  row: Record<string, unknown>
): OperationalDebtInvoiceInput {
  return invoiceInputFromProtoRow(row);
}
