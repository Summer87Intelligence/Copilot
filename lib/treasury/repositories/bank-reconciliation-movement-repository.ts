import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBankReconciliationMovementRow } from "@/lib/treasury/treasury-mappers";
import { eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import type {
  BankMovementListFilters,
  BankReconciliationMovement,
} from "@/lib/treasury/treasury-types";

const TABLE = "bank_reconciliation_movements" as const;

export async function bankReconciliationMovementRepositoryList(
  supabase: SupabaseClient,
  workspaceId: string,
  filters: BankMovementListFilters = {},
  limit = 200
): Promise<{ rows: BankReconciliationMovement[]; error: { message?: string } | null }> {
  let qb = eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.currencyCode) qb = qb.eq("currency_code", filters.currencyCode);
  if (filters.accountId) qb = qb.eq("account_id", filters.accountId);
  if (filters.fromDate) qb = qb.gte("movement_date", filters.fromDate);
  if (filters.toDate) qb = qb.lte("movement_date", filters.toDate);
  if (filters.movementType) qb = qb.eq("movement_type", filters.movementType);
  if (filters.matchStatus) qb = qb.eq("match_status", filters.matchStatus);
  if (filters.bankName) qb = qb.eq("bank_name", filters.bankName);

  const { data, error } = await qb;
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapBankReconciliationMovementRow(row)
  );
  return { rows, error: null };
}

export async function bankReconciliationMovementRepositoryGetById(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<{ row: BankReconciliationMovement | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .eq("id", id.trim())
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapBankReconciliationMovementRow(data as Record<string, unknown>), error: null };
}

export async function bankReconciliationMovementRepositoryInsert(
  supabase: SupabaseClient,
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<{ row: BankReconciliationMovement | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, workspace_id: workspaceId })
    .select("*")
    .single();
  if (error) return { row: null, error };
  return { row: mapBankReconciliationMovementRow(data as Record<string, unknown>), error: null };
}

export async function bankReconciliationMovementRepositoryUpdate(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ row: BankReconciliationMovement | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).update(payload), workspaceId)
    .eq("id", id.trim())
    .select("*")
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapBankReconciliationMovementRow(data as Record<string, unknown>), error: null };
}

export async function bankReconciliationMovementRepositoryListExternalIds(
  supabase: SupabaseClient,
  workspaceId: string,
  externalIds: readonly string[]
): Promise<{ ids: Set<string>; error: { message?: string } | null }> {
  const unique = [...new Set(externalIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { ids: new Set(), error: null };

  const { data, error } = await eqTreasuryWorkspace(
    supabase.from(TABLE).select("external_id"),
    workspaceId
  ).in("external_id", unique);

  if (error) return { ids: new Set(), error };
  const ids = new Set(
    ((data ?? []) as Array<{ external_id?: string | null }>)
      .map((row) => row.external_id?.trim())
      .filter((value): value is string => Boolean(value))
  );
  return { ids, error: null };
}
