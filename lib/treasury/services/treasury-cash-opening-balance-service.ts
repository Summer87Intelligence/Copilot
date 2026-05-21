import type { SupabaseClient } from "@supabase/supabase-js";

import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  treasuryCashOpeningBalanceRepositoryList,
  treasuryCashOpeningBalanceRepositoryUpsert,
  type TreasuryCashOpeningBalanceRow,
} from "@/lib/treasury/repositories/treasury-cash-opening-balance-repository";
import { manualCashMovementList } from "@/lib/treasury/services/manual-cash-movement-service";
import { mapDbError, todayYmdUtc, validationFailure } from "@/lib/treasury/treasury-db-helpers";

function addDaysYmd(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return ymd;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}
import {
  calculateCashPosition,
  sumManualExpenseInRange,
  type CashPositionByCurrency,
} from "@/lib/treasury/treasury-cash-position";
import { resolveTreasuryWorkspaceId } from "@/lib/treasury/treasury-tenant";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

export type TreasuryOpeningBalanceUpsertBody = {
  currency_code: TreasuryCurrencyCode;
  amount: number;
  effective_date?: string;
  notes?: string | null;
};

export async function treasuryCashOpeningBalanceList(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<ProtoCrudResult<TreasuryCashOpeningBalanceRow[]>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { rows, error } = await treasuryCashOpeningBalanceRepositoryList(
    supabase,
    workspaceId
  );
  if (error) return mapDbError(error);
  return protoCrudResult.ok(rows, "Saldos iniciales listados.");
}

export async function treasuryCashOpeningBalanceUpsert(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: TreasuryOpeningBalanceUpsertBody
): Promise<ProtoCrudResult<TreasuryCashOpeningBalanceRow>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  if (body.currency_code !== "UYU" && body.currency_code !== "USD") {
    return validationFailure([
      { field: "currency_code", code: "invalid", message: "currency_code debe ser UYU o USD." },
    ]);
  }
  if (!Number.isFinite(body.amount) || body.amount < 0) {
    return validationFailure([
      { field: "amount", code: "invalid", message: "amount debe ser >= 0." },
    ]);
  }

  const { row, error } = await treasuryCashOpeningBalanceRepositoryUpsert(
    supabase,
    workspaceId,
    {
      currency_code: body.currency_code,
      amount: body.amount,
      effective_date: body.effective_date ?? todayYmdUtc(),
      notes: body.notes ?? null,
    }
  );
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("DATABASE", "No se pudo guardar el saldo inicial.");
  return protoCrudResult.ok(row, "Saldo inicial guardado.");
}

export type TreasuryCashPositionResult = {
  positions: CashPositionByCurrency[];
  openingBalances: TreasuryCashOpeningBalanceRow[];
};

export async function treasuryCashPositionGet(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<ProtoCrudResult<TreasuryCashPositionResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);

  const [openings, movements] = await Promise.all([
    treasuryCashOpeningBalanceRepositoryList(supabase, workspaceId),
    manualCashMovementList(supabase, tenantCompanyId, { status: "active" }, 5000),
  ]);

  if (openings.error) return mapDbError(openings.error);
  if (!movements.ok) return movements;

  const items = movements.data.items;
  const asOf = todayYmdUtc();
  const rangeStart = addDaysYmd(asOf, -30);

  const positions = calculateCashPosition({
    manualCashMovements: items,
    openingBalances: openings.rows.map((r) => ({
      currency: r.currencyCode,
      amount: r.amount,
    })),
  }).map((p) => ({
    ...p,
    manualExpenseInRange: sumManualExpenseInRange(items, p.currency, rangeStart, asOf),
  }));

  return protoCrudResult.ok(
    { positions, openingBalances: openings.rows },
    "Posición de caja calculada."
  );
}
