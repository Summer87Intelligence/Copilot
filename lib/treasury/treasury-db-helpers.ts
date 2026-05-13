import type { SupabaseClient } from "@supabase/supabase-js";

import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import { mapTreasuryAccountRow } from "@/lib/treasury/treasury-mappers";
import { assertSameTreasuryWorkspace } from "@/lib/treasury/treasury-tenant";
import type { TreasuryAccount, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import type { TreasuryValidationIssue } from "@/lib/treasury/treasury-validation";

export const MSG_TREASURY_DB = "Error de base de datos. Intentá de nuevo.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function eqTreasuryWorkspace(qb: any, workspaceId: string): any {
  return qb.eq("workspace_id", workspaceId);
}

export function validationFailure<T>(issues: TreasuryValidationIssue[]): ProtoCrudResult<T> {
  const details = issues.map((i) => ({
    field: i.field,
    reason: i.message,
  }));
  const message = issues[0]?.message ?? "Datos inválidos.";
  return protoCrudResult.fail("VALIDATION", message, details);
}

export function mapDbError<T>(error: { message?: string } | null): ProtoCrudResult<T> {
  if (error?.message?.includes("violates foreign key")) {
    return protoCrudResult.fail("VALIDATION", "Referencia inválida (cuenta o registro relacionado).");
  }
  return protoCrudResult.fail("DATABASE", MSG_TREASURY_DB);
}

export async function fetchTreasuryAccountInWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  accountId: string
): Promise<ProtoCrudResult<TreasuryAccount>> {
  const { data, error } = await eqTreasuryWorkspace(
    supabase.from("treasury_accounts").select("*"),
    workspaceId
  )
    .eq("id", accountId.trim())
    .maybeSingle();

  if (error) return mapDbError(error);
  if (!data) {
    return protoCrudResult.fail("NOT_FOUND", "Cuenta treasury no encontrada.");
  }

  const account = mapTreasuryAccountRow(data as Record<string, unknown>);
  try {
    assertSameTreasuryWorkspace(workspaceId, account.workspaceId);
  } catch {
    return protoCrudResult.fail("NOT_FOUND", "Cuenta treasury no encontrada.");
  }
  return protoCrudResult.ok(account, "OK");
}

export async function ensureTreasuryAccountForMovement(
  supabase: SupabaseClient,
  workspaceId: string,
  accountId: string | null | undefined,
  currencyCode: TreasuryCurrencyCode
): Promise<ProtoCrudResult<TreasuryAccount | null>> {
  if (!accountId?.trim()) return protoCrudResult.ok(null, "OK");
  const loaded = await fetchTreasuryAccountInWorkspace(supabase, workspaceId, accountId);
  if (!loaded.ok) return loaded;
  if (!loaded.data.active) {
    return protoCrudResult.fail("VALIDATION", "La cuenta treasury está inactiva.");
  }
  if (loaded.data.currencyCode !== currencyCode) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La moneda del movimiento no coincide con la cuenta treasury."
    );
  }
  return protoCrudResult.ok(loaded.data, "OK");
}

export function parsePositiveAmount(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function parseListLimit(raw: string | null, fallback = 200, max = 500): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export function parseYmdQuery(value: string | null): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

export function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
