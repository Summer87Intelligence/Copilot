import type { SupabaseClient } from "@supabase/supabase-js";

import { eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

const TABLE = "treasury_cash_opening_balances" as const;

export type TreasuryCashOpeningBalanceRow = {
  id: string;
  workspaceId: string;
  currencyCode: TreasuryCurrencyCode;
  amount: number;
  effectiveDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: Record<string, unknown>): TreasuryCashOpeningBalanceRow {
  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    currencyCode: row.currency_code === "USD" ? "USD" : "UYU",
    amount: Number(row.amount ?? 0),
    effectiveDate: String(row.effective_date ?? "").slice(0, 10),
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function treasuryCashOpeningBalanceRepositoryList(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ rows: TreasuryCashOpeningBalanceRow[]; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(
    supabase.from(TABLE).select("*"),
    workspaceId
  ).order("currency_code", { ascending: true });

  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  return { rows, error: null };
}

export async function treasuryCashOpeningBalanceRepositoryUpsert(
  supabase: SupabaseClient,
  workspaceId: string,
  payload: {
    currency_code: TreasuryCurrencyCode;
    amount: number;
    effective_date?: string;
    notes?: string | null;
  }
): Promise<{ row: TreasuryCashOpeningBalanceRow | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        workspace_id: workspaceId,
        currency_code: payload.currency_code,
        amount: payload.amount,
        effective_date: payload.effective_date,
        notes: payload.notes ?? null,
      },
      { onConflict: "workspace_id,currency_code" }
    )
    .select("*")
    .single();

  if (error) return { row: null, error };
  return { row: mapRow(data as Record<string, unknown>), error: null };
}
