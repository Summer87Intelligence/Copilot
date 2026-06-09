import type { SupabaseClient } from "@supabase/supabase-js";

import { eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import type {
  TreasuryExchangeRate,
  TreasuryExchangeRateInput,
  TreasuryExchangeRateSource,
} from "@/lib/treasury/treasury-types";

const TABLE = "treasury_exchange_rates" as const;

function mapRow(row: Record<string, unknown>): TreasuryExchangeRate {
  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    uyuPerUsd: Number(row.uyu_per_usd ?? 0),
    effectiveDate: String(row.effective_date ?? "").slice(0, 10),
    source: (row.source as TreasuryExchangeRateSource) ?? "manual",
    notes: row.notes != null ? String(row.notes) : null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function treasuryExchangeRateRepositoryGetLatest(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ row: TreasuryExchangeRate | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapRow(data as Record<string, unknown>), error: null };
}

export async function treasuryExchangeRateRepositoryList(
  supabase: SupabaseClient,
  workspaceId: string,
  limit = 20
): Promise<{ rows: TreasuryExchangeRate[]; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  return { rows, error: null };
}

export async function treasuryExchangeRateRepositoryInsert(
  supabase: SupabaseClient,
  workspaceId: string,
  input: TreasuryExchangeRateInput,
  createdBy: string | null = null
): Promise<{ row: TreasuryExchangeRate | null; error: { message?: string } | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      workspace_id: workspaceId,
      uyu_per_usd: input.uyuPerUsd,
      effective_date: input.effectiveDate ?? today,
      source: input.source ?? "manual",
      notes: input.notes ?? null,
      created_by: createdBy,
    })
    .select("*")
    .single();

  if (error) return { row: null, error };
  return { row: mapRow(data as Record<string, unknown>), error: null };
}
