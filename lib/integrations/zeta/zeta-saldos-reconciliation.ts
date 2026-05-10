/**
 * Orphan pending invoice reconciliation — Fase 4.
 *
 * Detects invoices with balance_amount > 0 that Zeta stopped returning
 * in QuerySaldosPendientes and applies a 3-strike safe-zeroing rule.
 *
 * State is stored in proto_invoices.zeta_metadata under "zeta_reconciliation":
 * {
 *   pending_sync_missing_count: number,   // consecutive misses
 *   last_seen_in_zeta_at: string | null,  // ISO — last time Zeta returned it
 *   last_missing_detected_at: string | null // ISO — last time we flagged it missing
 * }
 *
 * 3-strike rule:
 *   1st miss → warn
 *   2nd miss → warn
 *   3rd miss → auto-close (balance=0, status=paid)
 *
 * On re-appearance: count resets to 0.
 * Auto-close is never a hard delete.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { protoUpdateInvoice } from "@/lib/copilot-proto-crud-service";
import { createLogger } from "@/lib/observability/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ORPHAN_AUTO_CLOSE_THRESHOLD = 3;

const VOIDED_STATUSES = new Set([
  "paid", "void", "voided", "canceled", "cancelled",
  "anulada", "anulado", "annulled", "annul",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrphanAction = "warn" | "closed" | "skipped";

export type OrphanReconciliationEntry = {
  type: "orphan_pending_invoice";
  invoice_id: string;
  client_id: string;
  invoice_number: string;
  balance_amount: number;
  missing_count: number;
  action: OrphanAction;
};

export type ReconciliationRunResult = {
  /** Total pending invoices for this company at time of check. */
  pending_invoices_checked: number;
  /** Invoices that weren't in Zeta's response (orphan candidates). */
  orphans_detected: number;
  /** Invoices warned (missing 1-2 times). */
  warnings: OrphanReconciliationEntry[];
  /** Invoices auto-closed (missing 3+ times). */
  auto_closed: OrphanReconciliationEntry[];
  /** Invoices skipped (status already closed, balance already 0). */
  skipped: OrphanReconciliationEntry[];
  /** DB errors during reconciliation (non-fatal). */
  db_errors: number;
};

export type ZetaReconciliationState = {
  pending_sync_missing_count: number;
  last_seen_in_zeta_at: string | null;
  last_missing_detected_at: string | null;
};

// ---------------------------------------------------------------------------
// Pure helpers (fully testable without DB)
// ---------------------------------------------------------------------------

export function readZetaReconciliationState(metadata: unknown): ZetaReconciliationState {
  const fallback: ZetaReconciliationState = {
    pending_sync_missing_count: 0,
    last_seen_in_zeta_at: null,
    last_missing_detected_at: null,
  };
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return fallback;
  }
  const m = metadata as Record<string, unknown>;
  const r = m.zeta_reconciliation;
  if (r == null || typeof r !== "object" || Array.isArray(r)) return fallback;
  const rec = r as Record<string, unknown>;
  const count =
    typeof rec.pending_sync_missing_count === "number" && rec.pending_sync_missing_count >= 0
      ? rec.pending_sync_missing_count
      : 0;
  const lastSeen =
    typeof rec.last_seen_in_zeta_at === "string" ? rec.last_seen_in_zeta_at : null;
  const lastMissing =
    typeof rec.last_missing_detected_at === "string" ? rec.last_missing_detected_at : null;
  return { pending_sync_missing_count: count, last_seen_in_zeta_at: lastSeen, last_missing_detected_at: lastMissing };
}

export function classifyOrphanAction(missingCount: number): OrphanAction {
  if (missingCount >= ORPHAN_AUTO_CLOSE_THRESHOLD) return "closed";
  return "warn";
}

export function mergeZetaReconciliationState(
  existingMetadata: unknown,
  patch: Partial<ZetaReconciliationState>
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existingMetadata != null &&
    typeof existingMetadata === "object" &&
    !Array.isArray(existingMetadata)
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {};

  const prev = readZetaReconciliationState(existingMetadata);
  base.zeta_reconciliation = {
    pending_sync_missing_count:
      patch.pending_sync_missing_count ?? prev.pending_sync_missing_count,
    last_seen_in_zeta_at: patch.last_seen_in_zeta_at ?? prev.last_seen_in_zeta_at,
    last_missing_detected_at:
      patch.last_missing_detected_at ?? prev.last_missing_detected_at,
  };
  return base;
}

// ---------------------------------------------------------------------------
// DB reconciliation function
// ---------------------------------------------------------------------------

type PendingInvoiceRow = {
  id: string;
  invoice_number: string;
  balance_amount: number;
  status: string | null;
  zeta_metadata: unknown;
};

export async function reconcileMissingPendingInvoices(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string,
  touchedInvoiceIds: Set<string>,
  opts: { syncRunId: string; requestId: string; now?: string }
): Promise<ReconciliationRunResult> {
  const wid = workspaceCompanyId.trim();
  const now = opts.now ?? new Date().toISOString();

  const result: ReconciliationRunResult = {
    pending_invoices_checked: 0,
    orphans_detected: 0,
    warnings: [],
    auto_closed: [],
    skipped: [],
    db_errors: 0,
  };

  // 1. Load all active invoices with positive balance for this company
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, status, zeta_metadata")
    .eq("workspace_company_id", wid)
    .eq("company_id", protoCompanyId)
    .eq("is_active", true)
    .gt("balance_amount", 0);

  if (error) {
    pipelineReconcileLog("error", "zeta_reconcile_load_error", {
      workspace_id: wid,
      company_id: protoCompanyId,
      error: error.message,
      sync_run_id: opts.syncRunId,
    });
    return result;
  }

  const rows = (data ?? []) as PendingInvoiceRow[];
  result.pending_invoices_checked = rows.length;

  for (const row of rows) {
    const status = (row.status ?? "").trim().toLowerCase();
    if (VOIDED_STATUSES.has(status)) {
      result.skipped.push(buildEntry(row, protoCompanyId, 0, "skipped"));
      continue;
    }

    const recState = readZetaReconciliationState(row.zeta_metadata);

    if (touchedInvoiceIds.has(row.id)) {
      // Seen in this sync — reset missing count if it was > 0
      if (recState.pending_sync_missing_count > 0) {
        const mergedMeta = mergeZetaReconciliationState(row.zeta_metadata, {
          pending_sync_missing_count: 0,
          last_seen_in_zeta_at: now,
        });
        const { error: upErr } = await supabase
          .from("proto_invoices")
          .update({ zeta_metadata: mergedMeta })
          .eq("id", row.id)
          .eq("workspace_company_id", wid);
        if (upErr) {
          result.db_errors++;
          pipelineReconcileLog("warn", "zeta_reconcile_reset_error", {
            invoice_id: row.id, error: upErr.message, sync_run_id: opts.syncRunId,
          });
        } else {
          pipelineReconcileLog("info", "zeta_reconcile_reset", {
            invoice_id: row.id,
            invoice_number: row.invoice_number,
            prev_missing_count: recState.pending_sync_missing_count,
            sync_run_id: opts.syncRunId,
          });
        }
      }
      continue;
    }

    // Not seen in this sync — orphan candidate
    result.orphans_detected++;
    const newCount = recState.pending_sync_missing_count + 1;
    const action = classifyOrphanAction(newCount);
    const entry = buildEntry(row, protoCompanyId, newCount, action);

    if (action === "closed") {
      // Auto-close: zero balance, set status=paid
      const closedMeta = mergeZetaReconciliationState(row.zeta_metadata, {
        pending_sync_missing_count: newCount,
        last_missing_detected_at: now,
      });
      // First update metadata to record reconciliation state
      const { error: metaErr } = await supabase
        .from("proto_invoices")
        .update({ zeta_metadata: closedMeta })
        .eq("id", row.id)
        .eq("workspace_company_id", wid);

      if (metaErr) {
        result.db_errors++;
        pipelineReconcileLog("warn", "zeta_reconcile_meta_error", {
          invoice_id: row.id, action, error: metaErr.message, sync_run_id: opts.syncRunId,
        });
      }

      // Then zero the balance via the CRUD service (respects integrity rules)
      const up = await protoUpdateInvoice(
        supabase,
        row.id,
        { balance_amount: 0, status: "paid" },
        wid,
        { allowBalanceGtTotal: true }
      );
      if (!up.ok) {
        result.db_errors++;
        pipelineReconcileLog("warn", "zeta_reconcile_close_error", {
          invoice_id: row.id, error: up.message, sync_run_id: opts.syncRunId,
        });
      } else {
        result.auto_closed.push(entry);
        pipelineReconcileLog("info", "zeta_reconcile_auto_closed", {
          type: "orphan_pending_invoice",
          invoice_id: row.id,
          invoice_number: row.invoice_number,
          client_id: protoCompanyId,
          balance_amount: row.balance_amount,
          missing_count: newCount,
          action: "closed",
          sync_run_id: opts.syncRunId,
        });
      }
    } else {
      // Warn: update missing count in metadata
      const warnMeta = mergeZetaReconciliationState(row.zeta_metadata, {
        pending_sync_missing_count: newCount,
        last_missing_detected_at: now,
      });
      const { error: warnErr } = await supabase
        .from("proto_invoices")
        .update({ zeta_metadata: warnMeta })
        .eq("id", row.id)
        .eq("workspace_company_id", wid);

      if (warnErr) {
        result.db_errors++;
        pipelineReconcileLog("warn", "zeta_reconcile_warn_error", {
          invoice_id: row.id, error: warnErr.message, sync_run_id: opts.syncRunId,
        });
      } else {
        result.warnings.push(entry);
        pipelineReconcileLog("warn", "zeta_reconcile_orphan_warning", {
          type: "orphan_pending_invoice",
          invoice_id: row.id,
          invoice_number: row.invoice_number,
          client_id: protoCompanyId,
          balance_amount: row.balance_amount,
          missing_count: newCount,
          action: "warn",
          sync_run_id: opts.syncRunId,
        });
      }
    }
  }

  pipelineReconcileLog("info", "zeta_reconcile_summary", {
    workspace_id: wid,
    company_id: protoCompanyId,
    pending_checked: result.pending_invoices_checked,
    orphans_detected: result.orphans_detected,
    warnings: result.warnings.length,
    auto_closed: result.auto_closed.length,
    skipped: result.skipped.length,
    db_errors: result.db_errors,
    sync_run_id: opts.syncRunId,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEntry(
  row: PendingInvoiceRow,
  clientId: string,
  missingCount: number,
  action: OrphanAction
): OrphanReconciliationEntry {
  return {
    type: "orphan_pending_invoice",
    invoice_id: row.id,
    client_id: clientId,
    invoice_number: row.invoice_number,
    balance_amount: row.balance_amount,
    missing_count: missingCount,
    action,
  };
}

const _reconcileLogger = createLogger({ source: "zeta_reconciliation" });

function pipelineReconcileLog(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown>
) {
  _reconcileLogger[level](message, undefined, fields);
}
