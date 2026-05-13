import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ManualCashMovementCreateBody,
  ManualCashMovementUpdateBody,
} from "@/lib/api/schemas/treasury-api-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  manualCashMovementRepositoryGetById,
  manualCashMovementRepositoryInsert,
  manualCashMovementRepositoryList,
  manualCashMovementRepositoryUpdate,
} from "@/lib/treasury/repositories/manual-cash-movement-repository";
import {
  ensureTreasuryAccountForMovement,
  mapDbError,
  validationFailure,
} from "@/lib/treasury/treasury-db-helpers";
import { resolveTreasuryWorkspaceId, normalizeErpCompanyId } from "@/lib/treasury/treasury-tenant";
import type { ManualCashListFilters, ManualCashMovement } from "@/lib/treasury/treasury-types";
import { validateManualCashMovementInput } from "@/lib/treasury/treasury-validation";

export type ManualCashMovementListResult = {
  items: ManualCashMovement[];
  count: number;
};

function buildManualCashMetadata(
  body: Pick<
    ManualCashMovementCreateBody | ManualCashMovementUpdateBody,
    "metadata" | "adjustment_direction" | "transfer_pair_id"
  >
): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = { ...(body.metadata ?? {}) };
  if (body.adjustment_direction) metadata.adjustment_direction = body.adjustment_direction;
  if (body.transfer_pair_id) metadata.transfer_pair_id = body.transfer_pair_id;
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function bodyToManualCashInput(body: ManualCashMovementCreateBody) {
  return {
    companyId: normalizeErpCompanyId(body.company_id),
    accountId: body.account_id ?? null,
    ledgerType: body.ledger_type,
    movementType: body.movement_type,
    source: body.source ?? "manual",
    concept: body.concept,
    category: body.category ?? null,
    amount: body.amount,
    currencyCode: body.currency_code,
    movementDate: body.movement_date,
    paymentMethod: body.payment_method ?? null,
    counterparty: body.counterparty ?? null,
    reference: body.reference ?? null,
    notes: body.notes ?? null,
    affectsCashflow: body.affects_cashflow ?? true,
    adjustmentDirection: body.adjustment_direction,
    transferPairId: body.transfer_pair_id ?? null,
    rawPayload: body.raw_payload ?? null,
    metadata: buildManualCashMetadata(body),
  };
}

export async function manualCashMovementList(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  filters: ManualCashListFilters = {},
  limit = 200
): Promise<ProtoCrudResult<ManualCashMovementListResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { rows, error } = await manualCashMovementRepositoryList(
    supabase,
    workspaceId,
    filters,
    limit
  );
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ items: rows, count: rows.length }, "Movimientos listados.");
}

export async function manualCashMovementCreate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: ManualCashMovementCreateBody
): Promise<ProtoCrudResult<ManualCashMovement>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const input = bodyToManualCashInput(body);

  const validation = validateManualCashMovementInput(input);
  if (!validation.ok) return validationFailure(validation.issues);

  const accountCheck = await ensureTreasuryAccountForMovement(
    supabase,
    workspaceId,
    input.accountId,
    input.currencyCode
  );
  if (!accountCheck.ok) return accountCheck;

  const { row, error } = await manualCashMovementRepositoryInsert(supabase, workspaceId, {
    company_id: input.companyId,
    account_id: input.accountId,
    ledger_type: input.ledgerType,
    movement_type: input.movementType,
    source: input.source,
    concept: input.concept,
    category: input.category,
    amount: input.amount,
    currency_code: input.currencyCode,
    movement_date: input.movementDate,
    payment_method: input.paymentMethod,
    counterparty: input.counterparty,
    reference: input.reference,
    notes: input.notes,
    affects_cashflow: input.affectsCashflow,
    raw_payload: input.rawPayload,
    metadata: input.metadata,
    status: "active",
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("DATABASE", "No se pudo crear el movimiento.");
  return protoCrudResult.ok(row, "Movimiento manual creado.");
}

export async function manualCashMovementUpdate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  body: ManualCashMovementUpdateBody
): Promise<ProtoCrudResult<ManualCashMovement>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await manualCashMovementRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Movimiento no encontrado.");
  if (existing.row.status === "archived") {
    return protoCrudResult.fail("VALIDATION", "No se puede editar un movimiento archivado.");
  }

  const merged = {
    companyId:
      body.company_id !== undefined
        ? normalizeErpCompanyId(body.company_id)
        : existing.row.companyId,
    accountId: body.account_id !== undefined ? body.account_id : existing.row.accountId,
    ledgerType: body.ledger_type ?? existing.row.ledgerType,
    movementType: body.movement_type ?? existing.row.movementType,
    source: body.source ?? existing.row.source,
    concept: body.concept ?? existing.row.concept,
    category: body.category !== undefined ? body.category : existing.row.category,
    amount: body.amount ?? existing.row.amount,
    currencyCode: body.currency_code ?? existing.row.currencyCode,
    movementDate: body.movement_date ?? existing.row.movementDate,
    paymentMethod:
      body.payment_method !== undefined ? body.payment_method : existing.row.paymentMethod,
    counterparty:
      body.counterparty !== undefined ? body.counterparty : existing.row.counterparty,
    reference: body.reference !== undefined ? body.reference : existing.row.reference,
    notes: body.notes !== undefined ? body.notes : existing.row.notes,
    affectsCashflow: body.affects_cashflow ?? existing.row.affectsCashflow,
    adjustmentDirection: body.adjustment_direction,
    transferPairId:
      body.transfer_pair_id !== undefined ? body.transfer_pair_id : undefined,
    rawPayload: body.raw_payload !== undefined ? body.raw_payload : existing.row.rawPayload,
    metadata: buildManualCashMetadata({
      metadata: body.metadata !== undefined ? body.metadata : existing.row.metadata,
      adjustment_direction: body.adjustment_direction,
      transfer_pair_id: body.transfer_pair_id,
    }),
  };

  const validation = validateManualCashMovementInput({
    ...merged,
    transferPairId: merged.transferPairId ?? null,
  });
  if (!validation.ok) return validationFailure(validation.issues);

  const accountCheck = await ensureTreasuryAccountForMovement(
    supabase,
    workspaceId,
    merged.accountId,
    merged.currencyCode
  );
  if (!accountCheck.ok) return accountCheck;

  const { row, error } = await manualCashMovementRepositoryUpdate(supabase, workspaceId, id, {
    company_id: merged.companyId,
    account_id: merged.accountId,
    ledger_type: merged.ledgerType,
    movement_type: merged.movementType,
    source: merged.source,
    concept: merged.concept,
    category: merged.category,
    amount: merged.amount,
    currency_code: merged.currencyCode,
    movement_date: merged.movementDate,
    payment_method: merged.paymentMethod,
    counterparty: merged.counterparty,
    reference: merged.reference,
    notes: merged.notes,
    affects_cashflow: merged.affectsCashflow,
    raw_payload: merged.rawPayload,
    metadata: merged.metadata,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Movimiento no encontrado.");
  return protoCrudResult.ok(row, "Movimiento actualizado.");
}

export async function manualCashMovementArchive(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<ProtoCrudResult<ManualCashMovement>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await manualCashMovementRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Movimiento no encontrado.");

  const { row, error } = await manualCashMovementRepositoryUpdate(supabase, workspaceId, id, {
    status: "archived",
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Movimiento no encontrado.");
  return protoCrudResult.ok(row, "Movimiento archivado.");
}
