import type { SupabaseClient } from "@supabase/supabase-js";

import { mapTreasuryAccountRow } from "@/lib/treasury/treasury-mappers";
import { eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import type { TreasuryAccount, TreasuryListFilters } from "@/lib/treasury/treasury-types";

const TABLE = "treasury_accounts" as const;

export async function treasuryAccountRepositoryList(
  supabase: SupabaseClient,
  workspaceId: string,
  filters: TreasuryListFilters = {},
  limit = 200
): Promise<{ rows: TreasuryAccount[]; error: { message?: string } | null }> {
  let qb = eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .order("name", { ascending: true })
    .limit(limit);

  if (filters.currencyCode) qb = qb.eq("currency_code", filters.currencyCode);
  if (filters.status === "active") qb = qb.eq("active", true);
  if (filters.status === "inactive") qb = qb.eq("active", false);

  const { data, error } = await qb;
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapTreasuryAccountRow(row)
  );
  return { rows, error: null };
}

export async function treasuryAccountRepositoryGetById(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<{ row: TreasuryAccount | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .eq("id", id.trim())
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapTreasuryAccountRow(data as Record<string, unknown>), error: null };
}

export async function treasuryAccountRepositoryInsert(
  supabase: SupabaseClient,
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<{ row: TreasuryAccount | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, workspace_id: workspaceId })
    .select("*")
    .single();
  if (error) return { row: null, error };
  return { row: mapTreasuryAccountRow(data as Record<string, unknown>), error: null };
}

export async function treasuryAccountRepositoryUpdate(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ row: TreasuryAccount | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).update(payload), workspaceId)
    .eq("id", id.trim())
    .select("*")
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapTreasuryAccountRow(data as Record<string, unknown>), error: null };
}
