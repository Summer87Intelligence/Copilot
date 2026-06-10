/**
 * Capa de dominio para Caja manual — delega en `manual-cash-movement-service`
 * y `manual_cash_movements` (ZETA-11-02). Sin conversión de monedas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ManualCashMovementCreateBody,
  ManualCashMovementUpdateBody,
} from "@/lib/api/schemas/treasury-api-bodies";
import type { ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  manualCashMovementCreate,
  manualCashMovementDelete,
  manualCashMovementList,
  manualCashMovementUpdate,
} from "@/lib/treasury/services/manual-cash-movement-service";
import type {
  ManualCashListFilters,
  ManualCashMovement,
  ManualCashSource,
} from "@/lib/treasury/treasury-types";

export type { ManualCashListFilters };

type ManualCashMovementSortKey = Pick<
  ManualCashMovement,
  "movementDate" | "createdAt" | "id"
>;

/** Más reciente primero: fecha ↓, created_at ↓, id ↓. */
export function compareManualCashMovementsNewestFirst(
  a: ManualCashMovementSortKey,
  b: ManualCashMovementSortKey
): number {
  const dateCmp = b.movementDate.localeCompare(a.movementDate);
  if (dateCmp !== 0) return dateCmp;
  const createdCmp = b.createdAt.localeCompare(a.createdAt);
  if (createdCmp !== 0) return createdCmp;
  return b.id.localeCompare(a.id);
}

export function sortManualCashMovementsNewestFirst<T extends ManualCashMovementSortKey>(
  movements: readonly T[]
): T[] {
  return [...movements].sort(compareManualCashMovementsNewestFirst);
}

/** Solo movimientos creados desde Caja manual (`source = manual`) son editables/eliminables en UI. */
export function isManualCashMovementEditable(
  row: Pick<ManualCashMovement, "source">
): boolean {
  return row.source === "manual";
}

export function isManualCashMovementDeletable(
  row: Pick<ManualCashMovement, "source">
): boolean {
  return row.source === "manual";
}

export function listManualCashMovements(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  filters: ManualCashListFilters = {},
  limit = 200
): Promise<ProtoCrudResult<{ items: ManualCashMovement[]; count: number }>> {
  return manualCashMovementList(supabase, tenantCompanyId, filters, limit);
}

export function createManualCashMovement(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  input: ManualCashMovementCreateBody
): Promise<ProtoCrudResult<ManualCashMovement>> {
  const body: ManualCashMovementCreateBody = {
    ...input,
    source: (input.source ?? "manual") as ManualCashSource,
  };
  return manualCashMovementCreate(supabase, tenantCompanyId, body);
}

export function updateManualCashMovement(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  input: ManualCashMovementUpdateBody
): Promise<ProtoCrudResult<ManualCashMovement>> {
  return manualCashMovementUpdate(supabase, tenantCompanyId, id, input);
}

export function deleteManualCashMovement(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<ProtoCrudResult<{ id: string }>> {
  return manualCashMovementDelete(supabase, tenantCompanyId, id);
}
