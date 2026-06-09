import type { SupabaseClient } from "@supabase/supabase-js";

import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  mapDbError,
  parsePositiveAmount,
} from "@/lib/treasury/treasury-db-helpers";
import {
  treasuryExchangeRateRepositoryGetLatest,
  treasuryExchangeRateRepositoryInsert,
  treasuryExchangeRateRepositoryList,
} from "@/lib/treasury/repositories/treasury-exchange-rate-repository";
import type { TreasuryExchangeRate, TreasuryExchangeRateInput } from "@/lib/treasury/treasury-types";

export async function treasuryExchangeRateGet(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ProtoCrudResult<{ rate: TreasuryExchangeRate | null }>> {
  const { row, error } = await treasuryExchangeRateRepositoryGetLatest(supabase, workspaceId);
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ rate: row }, "OK");
}

export async function treasuryExchangeRateList(
  supabase: SupabaseClient,
  workspaceId: string,
  limit = 20
): Promise<ProtoCrudResult<{ rates: TreasuryExchangeRate[] }>> {
  const { rows, error } = await treasuryExchangeRateRepositoryList(supabase, workspaceId, limit);
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ rates: rows }, "OK");
}

export async function treasuryExchangeRateCreate(
  supabase: SupabaseClient,
  workspaceId: string,
  input: TreasuryExchangeRateInput,
  createdBy: string | null = null
): Promise<ProtoCrudResult<{ rate: TreasuryExchangeRate }>> {
  const safeAmount = parsePositiveAmount(input.uyuPerUsd);
  if (!safeAmount) {
    return protoCrudResult.fail("VALIDATION", "El tipo de cambio debe ser un número positivo.");
  }
  if (safeAmount >= 1000) {
    return protoCrudResult.fail("VALIDATION", "El tipo de cambio debe ser menor a 1000 (valor en pesos por dólar).");
  }

  if (input.effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) {
    return protoCrudResult.fail("VALIDATION", "Fecha de vigencia inválida (YYYY-MM-DD).");
  }

  const { row, error } = await treasuryExchangeRateRepositoryInsert(
    supabase,
    workspaceId,
    { ...input, uyuPerUsd: safeAmount },
    createdBy
  );
  if (error) return mapDbError(error);
  if (!row) return mapDbError(null);
  return protoCrudResult.ok({ rate: row }, "OK");
}
