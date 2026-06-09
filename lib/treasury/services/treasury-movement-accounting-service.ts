import type { SupabaseClient } from "@supabase/supabase-js";

import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import { mapDbError } from "@/lib/treasury/treasury-db-helpers";
import {
  tmacRepositoryGetByMovementId,
  tmacRepositoryListByWorkspace,
  tmacRepositoryUpsert,
} from "@/lib/treasury/repositories/treasury-movement-accounting-repository";
import type {
  TreasuryMovementAccounting,
  TreasuryMovementAccountingInput,
  TreasuryMovementAccountingMatchStatus,
} from "@/lib/treasury/treasury-types";

const VALID_MATCH_STATUSES = new Set<TreasuryMovementAccountingMatchStatus>([
  "pending", "matched", "amount_mismatch", "currency_mismatch",
  "date_mismatch", "missing_zeta_entry", "manually_confirmed",
]);

export async function tmacGet(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string
): Promise<ProtoCrudResult<{ record: TreasuryMovementAccounting | null }>> {
  if (!movementId?.trim()) {
    return protoCrudResult.fail("VALIDATION", "movement_id requerido.");
  }
  const { row, error } = await tmacRepositoryGetByMovementId(supabase, workspaceId, movementId);
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ record: row }, "OK");
}

export async function tmacList(
  supabase: SupabaseClient,
  workspaceId: string,
  movementIds?: string[]
): Promise<ProtoCrudResult<{ records: TreasuryMovementAccounting[] }>> {
  const { rows, error } = await tmacRepositoryListByWorkspace(supabase, workspaceId, movementIds);
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ records: rows }, "OK");
}

export async function tmacUpsert(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string,
  input: TreasuryMovementAccountingInput,
  checkedBy: string | null = null
): Promise<ProtoCrudResult<{ record: TreasuryMovementAccounting }>> {
  if (!movementId?.trim()) {
    return protoCrudResult.fail("VALIDATION", "movement_id requerido.");
  }

  if (
    input.accountingMatchStatus !== undefined &&
    !VALID_MATCH_STATUSES.has(input.accountingMatchStatus)
  ) {
    return protoCrudResult.fail("VALIDATION", "accounting_match_status inválido.");
  }

  if (
    input.accountingChecked &&
    !input.zetaAccountingEntryId &&
    input.accountingMatchStatus !== "manually_confirmed"
  ) {
    const { row: existing } = await tmacRepositoryGetByMovementId(supabase, workspaceId, movementId);
    const hasEntry = existing?.zetaAccountingEntryId || input.zetaAccountingEntryId;
    const isManual = (input.accountingMatchStatus ?? existing?.accountingMatchStatus) === "manually_confirmed";
    if (!hasEntry && !isManual) {
      return protoCrudResult.fail(
        "VALIDATION",
        "No se puede marcar como 'validado' sin asiento Zeta asociado. Usá estado 'manually_confirmed' con nota si es confirmación manual."
      );
    }
  }

  const { row, error } = await tmacRepositoryUpsert(
    supabase,
    workspaceId,
    movementId,
    input,
    checkedBy
  );
  if (error) return mapDbError(error);
  if (!row) return mapDbError(null);
  return protoCrudResult.ok({ record: row }, "OK");
}
