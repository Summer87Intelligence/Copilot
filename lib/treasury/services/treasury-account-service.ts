import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  TreasuryAccountCreateBody,
  TreasuryAccountUpdateBody,
} from "@/lib/api/schemas/treasury-api-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  treasuryAccountRepositoryGetById,
  treasuryAccountRepositoryInsert,
  treasuryAccountRepositoryList,
  treasuryAccountRepositoryUpdate,
} from "@/lib/treasury/repositories/treasury-account-repository";
import {
  mapDbError,
  validationFailure,
} from "@/lib/treasury/treasury-db-helpers";
import { resolveTreasuryWorkspaceId, normalizeErpCompanyId } from "@/lib/treasury/treasury-tenant";
import type { TreasuryAccount, TreasuryListFilters } from "@/lib/treasury/treasury-types";
import { validateTreasuryAccountInput } from "@/lib/treasury/treasury-validation";

export type TreasuryAccountListResult = {
  items: TreasuryAccount[];
  count: number;
};

export async function treasuryAccountList(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  filters: TreasuryListFilters = {},
  limit = 200
): Promise<ProtoCrudResult<TreasuryAccountListResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { rows, error } = await treasuryAccountRepositoryList(supabase, workspaceId, filters, limit);
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ items: rows, count: rows.length }, "Cuentas treasury listadas.");
}

export async function treasuryAccountCreate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: TreasuryAccountCreateBody
): Promise<ProtoCrudResult<TreasuryAccount>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const input = {
    companyId: normalizeErpCompanyId(body.company_id),
    name: body.name,
    type: body.type,
    bankName: body.bank_name ?? null,
    accountNumber: body.account_number ?? null,
    currencyCode: body.currency_code,
    active: body.active ?? true,
    metadata: body.metadata ?? null,
  };
  const validation = validateTreasuryAccountInput(input);
  if (!validation.ok) return validationFailure(validation.issues);

  const { row, error } = await treasuryAccountRepositoryInsert(supabase, workspaceId, {
    company_id: input.companyId,
    name: input.name,
    type: input.type,
    bank_name: input.bankName,
    account_number: input.accountNumber,
    currency_code: input.currencyCode,
    active: input.active,
    metadata: input.metadata,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("DATABASE", "No se pudo crear la cuenta treasury.");
  return protoCrudResult.ok(row, "Cuenta treasury creada.");
}

export async function treasuryAccountUpdate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  body: TreasuryAccountUpdateBody
): Promise<ProtoCrudResult<TreasuryAccount>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await treasuryAccountRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Cuenta treasury no encontrada.");

  const next = {
    companyId:
      body.company_id !== undefined
        ? normalizeErpCompanyId(body.company_id)
        : existing.row.companyId,
    name: body.name ?? existing.row.name,
    type: body.type ?? existing.row.type,
    bankName: body.bank_name !== undefined ? body.bank_name : existing.row.bankName,
    accountNumber:
      body.account_number !== undefined ? body.account_number : existing.row.accountNumber,
    currencyCode: body.currency_code ?? existing.row.currencyCode,
    active: body.active ?? existing.row.active,
    metadata: body.metadata !== undefined ? body.metadata : existing.row.metadata,
  };
  const validation = validateTreasuryAccountInput(next);
  if (!validation.ok) return validationFailure(validation.issues);

  const payload: Record<string, unknown> = {
    company_id: next.companyId,
    name: next.name,
    type: next.type,
    bank_name: next.bankName,
    account_number: next.accountNumber,
    currency_code: next.currencyCode,
    active: next.active,
    metadata: next.metadata,
  };

  const { row, error } = await treasuryAccountRepositoryUpdate(
    supabase,
    workspaceId,
    id,
    payload
  );
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Cuenta treasury no encontrada.");
  return protoCrudResult.ok(row, "Cuenta treasury actualizada.");
}

export async function treasuryAccountDeactivate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<ProtoCrudResult<TreasuryAccount>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { row, error } = await treasuryAccountRepositoryUpdate(supabase, workspaceId, id, {
    active: false,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Cuenta treasury no encontrada.");
  return protoCrudResult.ok(row, "Cuenta treasury desactivada.");
}
