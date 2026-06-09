import type { SupabaseClient } from "@supabase/supabase-js";

import { eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import type {
  TreasuryMovementAccounting,
  TreasuryMovementAccountingInput,
  TreasuryMovementAccountingMatchStatus,
} from "@/lib/treasury/treasury-types";

const TABLE = "treasury_movement_accounting_reconciliations" as const;

function mapRow(row: Record<string, unknown>): TreasuryMovementAccounting {
  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    movementId: String(row.movement_id ?? ""),
    accountingPosted: Boolean(row.accounting_posted ?? false),
    accountingChecked: Boolean(row.accounting_checked ?? false),
    zetaAccountingEntryId: row.zeta_accounting_entry_id != null ? String(row.zeta_accounting_entry_id) : null,
    zetaAccountingEntryNumber: row.zeta_accounting_entry_number != null ? String(row.zeta_accounting_entry_number) : null,
    zetaAccountingEntryDate: row.zeta_accounting_entry_date != null ? String(row.zeta_accounting_entry_date).slice(0, 10) : null,
    zetaAccountingEntryAmount: row.zeta_accounting_entry_amount != null ? Number(row.zeta_accounting_entry_amount) : null,
    zetaAccountingEntryCurrency: row.zeta_accounting_entry_currency != null ? String(row.zeta_accounting_entry_currency) : null,
    accountingMatchStatus: (row.accounting_match_status as TreasuryMovementAccountingMatchStatus) ?? "pending",
    accountingNotes: row.accounting_notes != null ? String(row.accounting_notes) : null,
    accountingCheckedAt: row.accounting_checked_at != null ? String(row.accounting_checked_at) : null,
    accountingCheckedBy: row.accounting_checked_by != null ? String(row.accounting_checked_by) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function tmacRepositoryGetByMovementId(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string
): Promise<{ row: TreasuryMovementAccounting | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .eq("movement_id", movementId)
    .maybeSingle();

  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapRow(data as Record<string, unknown>), error: null };
}

export async function tmacRepositoryListByWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  movementIds?: string[]
): Promise<{ rows: TreasuryMovementAccounting[]; error: { message?: string } | null }> {
  let qb = eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId);
  if (movementIds && movementIds.length > 0) {
    qb = qb.in("movement_id", movementIds);
  }
  const { data, error } = await qb.order("created_at", { ascending: false }).limit(500);
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  return { rows, error: null };
}

export async function tmacRepositoryUpsert(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string,
  input: TreasuryMovementAccountingInput,
  checkedBy: string | null = null
): Promise<{ row: TreasuryMovementAccounting | null; error: { message?: string } | null }> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    movement_id: movementId,
  };

  if (input.accountingPosted !== undefined) payload.accounting_posted = input.accountingPosted;
  if (input.accountingChecked !== undefined) {
    payload.accounting_checked = input.accountingChecked;
    if (input.accountingChecked) {
      payload.accounting_checked_at = now;
      payload.accounting_checked_by = checkedBy;
    }
  }
  if (input.zetaAccountingEntryId !== undefined) payload.zeta_accounting_entry_id = input.zetaAccountingEntryId;
  if (input.zetaAccountingEntryNumber !== undefined) payload.zeta_accounting_entry_number = input.zetaAccountingEntryNumber;
  if (input.zetaAccountingEntryDate !== undefined) payload.zeta_accounting_entry_date = input.zetaAccountingEntryDate;
  if (input.zetaAccountingEntryAmount !== undefined) payload.zeta_accounting_entry_amount = input.zetaAccountingEntryAmount;
  if (input.zetaAccountingEntryCurrency !== undefined) payload.zeta_accounting_entry_currency = input.zetaAccountingEntryCurrency;
  if (input.accountingMatchStatus !== undefined) payload.accounting_match_status = input.accountingMatchStatus;
  if (input.accountingNotes !== undefined) payload.accounting_notes = input.accountingNotes;

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: "workspace_id,movement_id" })
    .select("*")
    .single();

  if (error) return { row: null, error };
  return { row: mapRow(data as Record<string, unknown>), error: null };
}
