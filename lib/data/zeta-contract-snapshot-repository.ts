/**
 * ZETA-16: Repository for zeta_contract_snapshots.
 *
 * Rows are write-once (append-only). Each call records a new shape sample.
 * Used to detect unknown fields or validation errors from Zeta payloads.
 *
 * Sanitized: stores only field names and structural metadata — no PII.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractSnapshotInput, ContractSnapshotRow } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

/** Appends a new contract snapshot row. Write-once, never updates. */
export async function appendContractSnapshot(
  supabase: SupabaseClient,
  input: ContractSnapshotInput
): Promise<ContractSnapshotRow | null> {
  const { data, error } = await supabase
    .from("zeta_contract_snapshots")
    .insert({
      endpoint: input.endpoint,
      workspace_company_id: input.workspace_company_id ?? null,
      schema_version: input.schema_version ?? "v1",
      field_names: input.field_names ?? [],
      unknown_fields: input.unknown_fields ?? [],
      validation_errors: input.validation_errors ?? [],
      is_valid: input.is_valid ?? true,
      row_count_in_batch: input.row_count_in_batch ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-contract-snapshot-repo", kind: "insert_error", error: error.message })
    );
    return null;
  }
  return data as ContractSnapshotRow;
}

/** Returns the most recent snapshots for a given endpoint. */
export async function getLatestContractSnapshots(
  supabase: SupabaseClient,
  endpoint: string,
  limit = 10
): Promise<ContractSnapshotRow[]> {
  const { data } = await supabase
    .from("zeta_contract_snapshots")
    .select("*")
    .eq("endpoint", endpoint)
    .order("sampled_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ContractSnapshotRow[];
}

/** Returns snapshots that detected unknown fields. */
export async function getSnapshotsWithUnknownFields(
  supabase: SupabaseClient,
  limit = 50
): Promise<ContractSnapshotRow[]> {
  const { data } = await supabase
    .from("zeta_contract_snapshots")
    .select("*")
    .filter("unknown_fields", "neq", "{}")
    .order("sampled_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ContractSnapshotRow[];
}

/** Returns the known field set for an endpoint (from last valid snapshot). */
export async function getKnownFields(
  supabase: SupabaseClient,
  endpoint: string
): Promise<string[]> {
  const { data } = await supabase
    .from("zeta_contract_snapshots")
    .select("field_names")
    .eq("endpoint", endpoint)
    .eq("is_valid", true)
    .order("sampled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { field_names: string[] } | null)?.field_names ?? [];
}
