/**
 * ZETA-16: Runtime contract guard for Zeta payloads.
 *
 * Validates incoming Zeta row shapes at runtime.
 * Design:
 *   - SOFT FAIL: validation errors never break the sync pipeline.
 *   - Quarantines invalid rows (excludes from pipeline, logs for review).
 *   - Detects unknown fields (new from Zeta) and emits structured logs.
 *   - Optionally persists a contract snapshot per batch.
 *
 * Usage:
 *   const { valid, quarantined, snapshot } = runContractGuard(rows, schema, endpoint);
 *   if (snapshot) await appendContractSnapshot(supabase, snapshot);
 */

import { z } from "zod";
import type { ContractSnapshotInput } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

export type ContractGuardResult<T> = {
  /** Rows that passed validation — safe to persist. */
  valid: T[];
  /** Rows that failed validation — quarantined, NOT persisted. */
  quarantined: Array<{ row: unknown; errors: string[] }>;
  /** Snapshot input ready for appendContractSnapshot (if any). */
  snapshot: ContractSnapshotInput | null;
  /** Unknown fields detected in the batch (not in schema). */
  unknown_fields: string[];
};

/**
 * Runs soft-fail Zod validation on a batch of raw rows.
 *
 * @param rows        - Raw rows from Zeta (type unknown).
 * @param schema      - Zod schema for a single row.
 * @param endpoint    - Zeta endpoint name, used for snapshot and logging.
 * @param workspaceId - Optional workspace for the snapshot.
 */
export function runContractGuard<T>(
  rows: unknown[],
  schema: z.ZodType<T>,
  endpoint: string,
  workspaceId?: string
): ContractGuardResult<T> {
  const valid: T[] = [];
  const quarantined: Array<{ row: unknown; errors: string[] }> = [];
  const allFieldNames = new Set<string>();
  const unknownFieldSet = new Set<string>();
  const allValidationErrors: string[] = [];

  const knownFields = extractSchemaKeys(schema);

  for (const row of rows) {
    if (row !== null && typeof row === "object" && !Array.isArray(row)) {
      const keys = Object.keys(row as Record<string, unknown>);
      for (const k of keys) {
        allFieldNames.add(k);
        if (!knownFieldsHas(knownFields, k)) {
          unknownFieldSet.add(k);
        }
      }
    }

    const result = schema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      quarantined.push({ row, errors });
      allValidationErrors.push(...errors.slice(0, 3)); // cap per row
    }
  }

  const unknown_fields = [...unknownFieldSet];
  const hasIssues = quarantined.length > 0 || unknown_fields.length > 0;

  if (unknown_fields.length > 0) {
    console.warn(
      JSON.stringify({
        source: "zeta-runtime-contract-guard",
        kind: "unknown_fields_detected",
        endpoint,
        workspace_company_id: workspaceId,
        unknown_fields,
        batch_size: rows.length,
      })
    );
  }

  if (quarantined.length > 0) {
    console.warn(
      JSON.stringify({
        source: "zeta-runtime-contract-guard",
        kind: "rows_quarantined",
        endpoint,
        workspace_company_id: workspaceId,
        quarantined_count: quarantined.length,
        total_count: rows.length,
        sample_errors: allValidationErrors.slice(0, 5),
      })
    );
  }

  // Build snapshot only when there's something worth recording
  const snapshot: ContractSnapshotInput | null = hasIssues || rows.length > 0
    ? {
        endpoint,
        workspace_company_id: workspaceId ?? null,
        schema_version: "v1",
        field_names: [...allFieldNames].sort(),
        unknown_fields,
        validation_errors: [...new Set(allValidationErrors)].slice(0, 20),
        is_valid: quarantined.length === 0,
        row_count_in_batch: rows.length,
      }
    : null;

  return { valid, quarantined, snapshot, unknown_fields };
}

/** Extracts top-level keys from a Zod object schema (best-effort). */
function extractSchemaKeys(schema: z.ZodType<unknown>): Set<string> {
  const keys = new Set<string>();
  if (schema instanceof z.ZodObject) {
    for (const k of Object.keys(schema.shape as Record<string, unknown>)) {
      keys.add(k);
    }
  }
  return keys;
}

/** Case-insensitive check for known fields. */
function knownFieldsHas(knownFields: Set<string>, field: string): boolean {
  if (knownFields.has(field)) return true;
  const lower = field.toLowerCase();
  for (const k of knownFields) {
    if (k.toLowerCase() === lower) return true;
  }
  return false;
}
