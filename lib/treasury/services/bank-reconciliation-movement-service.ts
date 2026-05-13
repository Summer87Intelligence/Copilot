import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BankReconciliationMatchBody,
  BankReconciliationMovementCreateBody,
  BankReconciliationMovementUpdateBody,
} from "@/lib/api/schemas/treasury-api-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  bankReconciliationMovementRepositoryGetById,
  bankReconciliationMovementRepositoryInsert,
  bankReconciliationMovementRepositoryList,
  bankReconciliationMovementRepositoryUpdate,
} from "@/lib/treasury/repositories/bank-reconciliation-movement-repository";
import {
  ensureTreasuryAccountForMovement,
  mapDbError,
  validationFailure,
} from "@/lib/treasury/treasury-db-helpers";
import { resolveTreasuryWorkspaceId, normalizeErpCompanyId } from "@/lib/treasury/treasury-tenant";
import type {
  BankMovementListFilters,
  BankReconciliationMovement,
} from "@/lib/treasury/treasury-types";
import { validateBankReconciliationMovementInput } from "@/lib/treasury/treasury-validation";

export type BankReconciliationMovementListResult = {
  items: BankReconciliationMovement[];
  count: number;
};

export async function bankReconciliationMovementList(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  filters: BankMovementListFilters = {},
  limit = 200
): Promise<ProtoCrudResult<BankReconciliationMovementListResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { rows, error } = await bankReconciliationMovementRepositoryList(
    supabase,
    workspaceId,
    filters,
    limit
  );
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ items: rows, count: rows.length }, "Movimientos bancarios listados.");
}

export async function bankReconciliationMovementCreate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: BankReconciliationMovementCreateBody
): Promise<ProtoCrudResult<BankReconciliationMovement>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const input = {
    companyId: normalizeErpCompanyId(body.company_id),
    accountId: body.account_id ?? null,
    bankName: body.bank_name ?? null,
    accountNumber: body.account_number ?? null,
    accountName: body.account_name ?? null,
    movementDate: body.movement_date,
    description: body.description,
    amount: body.amount,
    currencyCode: body.currency_code,
    movementType: body.movement_type,
    externalId: body.external_id ?? null,
    documentNumber: body.document_number ?? null,
    balanceAfter: body.balance_after ?? null,
    importedFrom: body.imported_from ?? "manual",
    rawPayload: body.raw_payload ?? null,
    notes: body.notes ?? null,
  };

  const validation = validateBankReconciliationMovementInput(input);
  if (!validation.ok) return validationFailure(validation.issues);

  const accountCheck = await ensureTreasuryAccountForMovement(
    supabase,
    workspaceId,
    input.accountId,
    input.currencyCode
  );
  if (!accountCheck.ok) return accountCheck;

  const { row, error } = await bankReconciliationMovementRepositoryInsert(supabase, workspaceId, {
    company_id: input.companyId,
    account_id: input.accountId,
    bank_name: input.bankName,
    account_number: input.accountNumber,
    account_name: input.accountName,
    movement_date: input.movementDate,
    description: input.description,
    amount: input.amount,
    currency_code: input.currencyCode,
    movement_type: input.movementType,
    external_id: input.externalId,
    document_number: input.documentNumber,
    balance_after: input.balanceAfter,
    imported_from: input.importedFrom,
    raw_payload: input.rawPayload,
    notes: input.notes,
    matched: false,
    match_status: "unmatched",
    matched_source: "none",
    matched_record_id: null,
    confidence: null,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("DATABASE", "No se pudo crear el movimiento bancario.");
  return protoCrudResult.ok(row, "Movimiento bancario creado.");
}

export async function bankReconciliationMovementUpdate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  body: BankReconciliationMovementUpdateBody
): Promise<ProtoCrudResult<BankReconciliationMovement>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await bankReconciliationMovementRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Movimiento bancario no encontrado.");

  const merged = {
    companyId:
      body.company_id !== undefined
        ? normalizeErpCompanyId(body.company_id)
        : existing.row.companyId,
    accountId: body.account_id !== undefined ? body.account_id : existing.row.accountId,
    bankName: body.bank_name !== undefined ? body.bank_name : existing.row.bankName,
    accountNumber:
      body.account_number !== undefined ? body.account_number : existing.row.accountNumber,
    accountName: body.account_name !== undefined ? body.account_name : existing.row.accountName,
    movementDate: body.movement_date ?? existing.row.movementDate,
    description: body.description ?? existing.row.description,
    amount: body.amount ?? existing.row.amount,
    currencyCode: body.currency_code ?? existing.row.currencyCode,
    movementType: body.movement_type ?? existing.row.movementType,
    externalId: body.external_id !== undefined ? body.external_id : existing.row.externalId,
    documentNumber:
      body.document_number !== undefined ? body.document_number : existing.row.documentNumber,
    balanceAfter:
      body.balance_after !== undefined ? body.balance_after : existing.row.balanceAfter,
    rawPayload: body.raw_payload !== undefined ? body.raw_payload : existing.row.rawPayload,
    notes: body.notes !== undefined ? body.notes : existing.row.notes,
  };

  const validation = validateBankReconciliationMovementInput({
    ...merged,
    importedFrom: existing.row.importedFrom,
  });
  if (!validation.ok) return validationFailure(validation.issues);

  const accountCheck = await ensureTreasuryAccountForMovement(
    supabase,
    workspaceId,
    merged.accountId,
    merged.currencyCode
  );
  if (!accountCheck.ok) return accountCheck;

  const { row, error } = await bankReconciliationMovementRepositoryUpdate(
    supabase,
    workspaceId,
    id,
    {
      company_id: merged.companyId,
      account_id: merged.accountId,
      bank_name: merged.bankName,
      account_number: merged.accountNumber,
      account_name: merged.accountName,
      movement_date: merged.movementDate,
      description: merged.description,
      amount: merged.amount,
      currency_code: merged.currencyCode,
      movement_type: merged.movementType,
      external_id: merged.externalId,
      document_number: merged.documentNumber,
      balance_after: merged.balanceAfter,
      raw_payload: merged.rawPayload,
      notes: merged.notes,
    }
  );
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Movimiento bancario no encontrado.");
  return protoCrudResult.ok(row, "Movimiento bancario actualizado.");
}

export async function bankReconciliationMovementMarkMatched(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  body: BankReconciliationMatchBody
): Promise<ProtoCrudResult<BankReconciliationMovement>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await bankReconciliationMovementRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Movimiento bancario no encontrado.");

  if (body.matched_source === "none") {
    return protoCrudResult.fail("VALIDATION", "matched_source no puede ser none al conciliar.");
  }

  const { row, error } = await bankReconciliationMovementRepositoryUpdate(
    supabase,
    workspaceId,
    id,
    {
      matched: true,
      match_status: "matched",
      matched_source: body.matched_source,
      matched_record_id: body.matched_record_id,
      confidence: body.confidence ?? null,
      notes: body.notes !== undefined ? body.notes : existing.row.notes,
    }
  );
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Movimiento bancario no encontrado.");
  return protoCrudResult.ok(row, "Movimiento bancario conciliado.");
}

export async function bankReconciliationMovementMarkIgnored(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  notes: string | null | undefined
): Promise<ProtoCrudResult<BankReconciliationMovement>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await bankReconciliationMovementRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Movimiento bancario no encontrado.");

  const { row, error } = await bankReconciliationMovementRepositoryUpdate(
    supabase,
    workspaceId,
    id,
    {
      matched: false,
      match_status: "ignored",
      matched_source: "none",
      matched_record_id: null,
      confidence: null,
      notes: notes !== undefined ? notes : existing.row.notes,
    }
  );
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Movimiento bancario no encontrado.");
  return protoCrudResult.ok(row, "Movimiento bancario ignorado.");
}
