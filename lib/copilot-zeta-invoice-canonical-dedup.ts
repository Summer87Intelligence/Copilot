/**
 * Canonical dedup for Zeta shadow invoices across all reporting surfaces.
 *
 * Replaces both `dedupZetaSaldosShadowsAgainstCcv1` (Reconciliation) and
 * the implementation inside `dedupeZetaShadowInvoicesForReporting` (Trends /
 * Reports / CEO) so that every module uses an identical invoice universe.
 *
 * Three-pass algorithm:
 *   Pass 1 — RegistroId exact match (invoice_number pattern or CCV1 metadata)
 *   Pass 2 — company + currency + issue_date bucket + amount ±0.20 tolerance
 *   Pass 3 — exact fingerprint fallback (company|date|currency|amount.toFixed(2))
 *
 * Safety invariants:
 *   • A row is a shadow candidate only when: invoice_number ~ ^ZETA:\d+$ AND
 *     category = "Zeta / saldos pendientes". Both conditions required — a ZETA:*
 *     row with a different category (historical import, backfill) is NOT a shadow.
 *   • Voided / cancelled CCV1s are not counted as valid dedup peers.
 *   • Never drops a CCV1 (`ZETA:CCV1:*`) row.
 *   • Never drops a regular (non-ZETA) invoice.
 *   • Orphan shadows with no CCV1 peer in any pass are kept.
 *   • Deterministic: result is independent of input order.
 */

import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import {
  extractRegistroIdsFromInvoiceZetaMetadata,
  parseZetaLegacyRegistroIdFromInvoiceNumber,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

/** ±0.20 tolerance — same as the original Reconciliation guardrail. */
export const SHADOW_DEDUP_TOLERANCE = 0.20;

const ZETA_SALDOS_CATEGORY = "Zeta / saldos pendientes";

const VOIDED_STATUSES = new Set([
  "void",
  "voided",
  "cancelled",
  "canceled",
  "anulada",
  "anulado",
  "annulled",
  "annul",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function str(row: DataRow, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function num(row: DataRow, key: string): number {
  const v = row[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rowId(row: DataRow): string {
  return String(row.id ?? "").trim();
}

function isCcv1(row: DataRow): boolean {
  return str(row, "invoice_number").startsWith("ZETA:CCV1:");
}

function isVoidedRow(row: DataRow): boolean {
  const s = str(row, "status").trim().toLowerCase();
  return s !== "" && VOIDED_STATUSES.has(s);
}

/**
 * True if this row is a shadow candidate (can be dropped when a CCV1 peer exists).
 *
 * Requires BOTH conditions — intersection of Algorithm A and B criteria:
 *   1. invoice_number matches `^ZETA:\d+$` (pure-digit suffix, not CCV1)
 *   2. category = "Zeta / saldos pendientes"
 *
 * A ZETA:* row with a different category (e.g. "Import manual / pre-CCV1") is a
 * real invoice and must NOT be treated as a pipeline shadow.
 */
function isShadowCandidate(row: DataRow): boolean {
  if (isCcv1(row)) return false;
  return (
    /^ZETA:\d+$/.test(str(row, "invoice_number")) &&
    str(row, "category") === ZETA_SALDOS_CATEGORY
  );
}

/**
 * Resolves a stable RegistroId for a row:
 *   1. `ZETA:\d+` invoice_number → the digit suffix.
 *   2. `zeta_comprobante_identity_v1.registro_id` or voucher_v1 metadata (exactly one result).
 * Returns null if no stable id can be resolved.
 */
function resolveRegistroId(row: DataRow): string | null {
  const fromNum = parseZetaLegacyRegistroIdFromInvoiceNumber(str(row, "invoice_number"));
  if (fromNum) return fromNum;
  const fromMeta = extractRegistroIdsFromInvoiceZetaMetadata(row.zeta_metadata);
  return fromMeta.length === 1 ? fromMeta[0]! : null;
}

/** Preference: CCV1 > row-with-metadata > first seen. Never promotes shadow over CCV1. */
function preferRow(a: DataRow, b: DataRow): DataRow {
  const aCcv1 = isCcv1(a);
  const bCcv1 = isCcv1(b);
  if (aCcv1 && !bCcv1) return a;
  if (bCcv1 && !aCcv1) return b;
  const aMeta = extractRegistroIdsFromInvoiceZetaMetadata(a.zeta_metadata).length > 0;
  const bMeta = extractRegistroIdsFromInvoiceZetaMetadata(b.zeta_metadata).length > 0;
  if (aMeta && !bMeta) return a;
  if (bMeta && !aMeta) return b;
  return a;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function dedupeZetaShadowInvoicesCanonical(invoices: DataRow[]): DataRow[] {
  const droppedIds = new Set<string>();

  // -------------------------------------------------------------------------
  // Pass 1 — RegistroId grouping
  // -------------------------------------------------------------------------
  // Group all rows that share a (company_id, registroId) pair.
  // Prefer CCV1 over shadow; drop only the shadow loser (never a CCV1).
  // Handles date-shifted pairs where the date-bucket in Pass 2 would miss them.

  const byRegistro = new Map<string, DataRow>();

  for (const row of invoices) {
    const companyId = str(row, "company_id");
    const registroId = resolveRegistroId(row);
    if (!registroId) continue;

    const regKey = `${companyId}:registro:${registroId}`;
    const prev = byRegistro.get(regKey);
    if (prev) {
      const keep = preferRow(prev, row);
      const drop = keep === prev ? row : prev;
      if (isShadowCandidate(drop)) {
        const dropId = rowId(drop);
        if (dropId) droppedIds.add(dropId);
      }
      byRegistro.set(regKey, keep);
    } else {
      byRegistro.set(regKey, row);
    }
  }

  // -------------------------------------------------------------------------
  // Pass 2 — date-bucket + amount ±0.20 (Algorithm A logic)
  // -------------------------------------------------------------------------
  // Build a bucket of CCV1 amounts keyed by company|currency|issue_date.
  // Voided CCV1s are excluded — a cancelled CCV1 is not a valid peer.
  // Drop any shadow whose total_amount is within SHADOW_DEDUP_TOLERANCE of
  // any CCV1 amount in the same bucket.

  const ccv1Buckets = new Map<string, number[]>();

  for (const row of invoices) {
    const rid = rowId(row);
    if (rid && droppedIds.has(rid)) continue;
    if (!isCcv1(row)) continue;
    if (isVoidedRow(row)) continue;
    const company = str(row, "company_id").trim();
    const currency = str(row, "currency_code").trim().toUpperCase();
    const issueDate = str(row, "issue_date").slice(0, 10);
    if (!company || !currency || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) continue;
    const bucketKey = `${company}|${currency}|${issueDate}`;
    const list = ccv1Buckets.get(bucketKey) ?? [];
    list.push(r2(Math.max(0, num(row, "total_amount"))));
    ccv1Buckets.set(bucketKey, list);
  }

  for (const row of invoices) {
    const rid = rowId(row);
    if (rid && droppedIds.has(rid)) continue;
    if (!isShadowCandidate(row)) continue;
    const company = str(row, "company_id").trim();
    const currency = str(row, "currency_code").trim().toUpperCase();
    const issueDate = str(row, "issue_date").slice(0, 10);
    const bucketKey = `${company}|${currency}|${issueDate}`;
    const bucket = ccv1Buckets.get(bucketKey);
    if (!bucket) continue;
    const shadowTotal = r2(Math.max(0, num(row, "total_amount")));
    if (bucket.some((t) => Math.abs(t - shadowTotal) <= SHADOW_DEDUP_TOLERANCE)) {
      if (rid) droppedIds.add(rid);
    }
  }

  // -------------------------------------------------------------------------
  // Pass 3 — exact fingerprint fallback (Algorithm B pass-3 logic)
  // -------------------------------------------------------------------------
  // For shadows not eliminated above: drop if an active CCV1 with the same
  // fingerprint (company|date|currency|amount.toFixed(2)) exists.

  const ccv1Fingerprints = new Set<string>();

  for (const row of invoices) {
    const rid = rowId(row);
    if (rid && droppedIds.has(rid)) continue;
    if (!isCcv1(row)) continue;
    if (isVoidedRow(row)) continue;
    const fp = [
      str(row, "company_id"),
      str(row, "issue_date").slice(0, 10),
      str(row, "currency_code").trim().toUpperCase(),
      r2(num(row, "total_amount")).toFixed(2),
    ].join("|");
    ccv1Fingerprints.add(fp);
  }

  for (const row of invoices) {
    const rid = rowId(row);
    if (rid && droppedIds.has(rid)) continue;
    if (!isShadowCandidate(row)) continue;
    const fp = [
      str(row, "company_id"),
      str(row, "issue_date").slice(0, 10),
      str(row, "currency_code").trim().toUpperCase(),
      r2(num(row, "total_amount")).toFixed(2),
    ].join("|");
    if (ccv1Fingerprints.has(fp)) {
      if (rid) droppedIds.add(rid);
    }
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  if (droppedIds.size === 0) return invoices;
  return invoices.filter((row) => {
    const rid = rowId(row);
    return !rid || !droppedIds.has(rid);
  });
}
