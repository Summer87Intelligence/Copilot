import type { SupabaseClient } from "@supabase/supabase-js";

import { mapManualCashMovementRow } from "@/lib/treasury/treasury-mappers";
import { eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import type { ManualCashListFilters, ManualCashMovement } from "@/lib/treasury/treasury-types";

const TABLE = "manual_cash_movements" as const;

export async function manualCashMovementRepositoryList(
  supabase: SupabaseClient,
  workspaceId: string,
  filters: ManualCashListFilters = {},
  limit = 200
): Promise<{ rows: ManualCashMovement[]; error: { message?: string } | null }> {
  let qb = eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (filters.currencyCode) qb = qb.eq("currency_code", filters.currencyCode);
  if (filters.accountId) qb = qb.eq("account_id", filters.accountId);
  if (filters.fromDate) qb = qb.gte("movement_date", filters.fromDate);
  if (filters.toDate) qb = qb.lte("movement_date", filters.toDate);
  if (filters.status) qb = qb.eq("status", filters.status);
  if (filters.movementType) qb = qb.eq("movement_type", filters.movementType);
  if (filters.ledgerType) qb = qb.eq("ledger_type", filters.ledgerType);
  if (filters.category) qb = qb.eq("category", filters.category);

  const { data, error } = await qb;
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapManualCashMovementRow(row)
  );
  return { rows, error: null };
}

export async function manualCashMovementRepositoryGetById(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<{ row: ManualCashMovement | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .eq("id", id.trim())
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapManualCashMovementRow(data as Record<string, unknown>), error: null };
}

export async function manualCashMovementRepositoryInsert(
  supabase: SupabaseClient,
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<{ row: ManualCashMovement | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, workspace_id: workspaceId })
    .select("*")
    .single();
  if (error) return { row: null, error };
  return { row: mapManualCashMovementRow(data as Record<string, unknown>), error: null };
}

export async function manualCashMovementRepositoryUpdate(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ row: ManualCashMovement | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).update(payload), workspaceId)
    .eq("id", id.trim())
    .select("*")
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapManualCashMovementRow(data as Record<string, unknown>), error: null };
}

export async function manualCashMovementRepositoryDelete(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<{ deleted: boolean; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).delete(), workspaceId)
    .eq("id", id.trim())
    .select("id")
    .maybeSingle();
  if (error) return { deleted: false, error };
  return { deleted: data != null, error: null };
}
