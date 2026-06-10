/**
 * Orphan invoice metadata auto-repair — clears stale `zeta_reconciliation` flags
 * after auto-close or when invoices are no longer financially open.
 *
 * Active orphan warning (UI/health): missing_count >= 1 AND balance > 0 AND not closed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
import {
  mergeZetaReconciliationState,
  readZetaReconciliationState,
  type ZetaReconciliationState,
} from "@/lib/integrations/zeta/zeta-saldos-reconciliation";

export const ORPHAN_RESOLVED_REASONS = {
  AUTO_CLOSED: "auto_closed_orphan",
  REAPPEARED_IN_ZETA: "reappeared_in_zeta",
  NEVER_SEEN_REPAIR: "never_seen_repair",
  STALE_METADATA_REPAIR: "stale_metadata_repair",
  BALANCE_ZERO: "balance_zero",
  ALREADY_PAID: "already_paid",
  SHADOW_SUPERSEDED_BY_CCV1: "shadow_superseded_by_ccv1",
} as const;

export type OrphanResolvedReason =
  (typeof ORPHAN_RESOLVED_REASONS)[keyof typeof ORPHAN_RESOLVED_REASONS];

const CLOSED_ORPHAN_STATUSES = new Set([
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

export type OrphanWarningInvoiceView = {
  reconciliation_missing_count?: number | null;
  balance_amount?: number | null;
  status?: string | null;
};

/** Factura con warning orphan activo (deuda abierta + missing_count). */
export function isActiveOrphanWarning(inv: OrphanWarningInvoiceView): boolean {
  const mc = inv.reconciliation_missing_count;
  if (mc == null || mc < 1) return false;
  const balance =
    inv.balance_amount != null && Number.isFinite(inv.balance_amount)
      ? inv.balance_amount
      : 0;
  if (balance <= 0) return false;
  const status = (inv.status ?? "").trim().toLowerCase();
  if (CLOSED_ORPHAN_STATUSES.has(status)) return false;
  return true;
}

/** Metadata orphan obsoleta: missing_count > 0 pero ya no hay deuda abierta. */
export function isStaleOrphanMetadata(inv: OrphanWarningInvoiceView): boolean {
  const mc = inv.reconciliation_missing_count;
  if (mc == null || mc < 1) return false;
  return !isActiveOrphanWarning(inv);
}

export function classifyStaleOrphanRepairReason(
  balance: number,
  status: string | null
): OrphanResolvedReason {
  const st = (status ?? "").trim().toLowerCase();
  if (st === "paid") return ORPHAN_RESOLVED_REASONS.ALREADY_PAID;
  if (balance <= 0) return ORPHAN_RESOLVED_REASONS.BALANCE_ZERO;
  if (CLOSED_ORPHAN_STATUSES.has(st)) return ORPHAN_RESOLVED_REASONS.STALE_METADATA_REPAIR;
  return ORPHAN_RESOLVED_REASONS.STALE_METADATA_REPAIR;
}

export function buildOrphanResolvedMetadataPatch(
  existingMetadata: unknown,
  reason: OrphanResolvedReason,
  now: string
): Record<string, unknown> {
  const prev = readZetaReconciliationState(existingMetadata);
  const patch: Partial<ZetaReconciliationState> = {
    pending_sync_missing_count: 0,
    resolved_at: now,
    resolved_reason: reason,
    resolved_automatically: true,
  };
  if (prev.last_seen_in_zeta_at) {
    patch.last_seen_in_zeta_at = prev.last_seen_in_zeta_at;
  }
  return mergeZetaReconciliationState(existingMetadata, patch);
}

export type OrphanMetadataRepairResult = {
  scanned: number;
  repaired: number;
  skipped: number;
  db_errors: number;
  repaired_invoice_ids: string[];
};

type RepairRow = {
  id: string;
  invoice_number: string;
  balance_amount: number;
  status: string | null;
  zeta_metadata: unknown;
};

const repairLogger = createLogger({ source: "zeta_orphan_auto_repair" });

/**
 * Limpia metadata orphan obsoleta para un workspace (idempotente).
 * No modifica balance ni status — solo `zeta_metadata.zeta_reconciliation`.
 */
export async function repairStaleOrphanInvoiceMetadata(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  opts: { requestId?: string; now?: string; limit?: number } = {}
): Promise<OrphanMetadataRepairResult> {
  const wid = workspaceCompanyId.trim();
  const now = opts.now ?? new Date().toISOString();
  const limit = opts.limit ?? 500;

  const result: OrphanMetadataRepairResult = {
    scanned: 0,
    repaired: 0,
    skipped: 0,
    db_errors: 0,
    repaired_invoice_ids: [],
  };

  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, status, zeta_metadata")
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .not("zeta_metadata", "is", null)
    .limit(limit);

  if (error) {
    repairLogger.error("orphan_repair_load_error", undefined, {
      workspace_id: wid,
      error: error.message,
      request_id: opts.requestId,
    });
    return result;
  }

  const rows = ((data ?? []) as RepairRow[]).filter((row) => {
    return readZetaReconciliationState(row.zeta_metadata).pending_sync_missing_count > 0;
  });
  result.scanned = rows.length;

  for (const row of rows) {
    const balance = Number(row.balance_amount ?? 0);
    const view: OrphanWarningInvoiceView = {
      reconciliation_missing_count: readZetaReconciliationState(row.zeta_metadata)
        .pending_sync_missing_count,
      balance_amount: balance,
      status: row.status,
    };

    if (!isStaleOrphanMetadata(view)) {
      result.skipped++;
      continue;
    }

    const reason = classifyStaleOrphanRepairReason(balance, row.status);
    const mergedMeta = buildOrphanResolvedMetadataPatch(row.zeta_metadata, reason, now);

    const { error: upErr } = await supabase
      .from("proto_invoices")
      .update({ zeta_metadata: mergedMeta })
      .eq("id", row.id)
      .eq("workspace_company_id", wid);

    if (upErr) {
      result.db_errors++;
      repairLogger.warn("orphan_repair_update_error", {
        workspace_id: wid,
        invoice_id: row.id,
        error: upErr.message,
        request_id: opts.requestId,
      });
      continue;
    }

    result.repaired++;
    result.repaired_invoice_ids.push(row.id);
    repairLogger.info("orphan_metadata_repaired", {
      workspace_id: wid,
      invoice_id: row.id,
      invoice_number: row.invoice_number,
      missing_count_cleared: view.reconciliation_missing_count,
      resolved_reason: reason,
      request_id: opts.requestId,
    });
  }

  repairLogger.info("orphan_repair_summary", {
    workspace_id: wid,
    scanned: result.scanned,
    repaired: result.repaired,
    skipped: result.skipped,
    db_errors: result.db_errors,
    request_id: opts.requestId,
  });

  return result;
}
