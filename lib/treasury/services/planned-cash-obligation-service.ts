import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PlannedCashObligationCreateBody,
  PlannedCashObligationUpdateBody,
} from "@/lib/api/schemas/treasury-api-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  plannedCashObligationRepositoryGetById,
  plannedCashObligationRepositoryInsert,
  plannedCashObligationRepositoryList,
  plannedCashObligationRepositoryUpdate,
} from "@/lib/treasury/repositories/planned-cash-obligation-repository";
import {
  ensureTreasuryAccountForMovement,
  mapDbError,
  todayYmdUtc,
  validationFailure,
} from "@/lib/treasury/treasury-db-helpers";
import {
  filterOverdueObligations,
  filterUpcomingObligations,
} from "@/lib/treasury/treasury-obligation-status";
import { filterPlannedCashObligationsForScheduledOutflow } from "@/lib/treasury/treasury-scheduled-outflow-eligibility";
import { resolveTreasuryWorkspaceId, normalizeErpCompanyId } from "@/lib/treasury/treasury-tenant";
import type {
  PlannedCashObligation,
  PlannedObligationListFilters,
} from "@/lib/treasury/treasury-types";
import { validatePlannedCashObligationInput } from "@/lib/treasury/treasury-validation";

export type PlannedCashObligationListResult = {
  items: PlannedCashObligation[];
  count: number;
};

async function ensureExpectedAccount(
  supabase: SupabaseClient,
  workspaceId: string,
  accountId: string | null | undefined,
  currencyCode: PlannedCashObligation["currencyCode"]
): Promise<ProtoCrudResult<null>> {
  const check = await ensureTreasuryAccountForMovement(
    supabase,
    workspaceId,
    accountId,
    currencyCode
  );
  if (!check.ok) return check;
  return protoCrudResult.ok(null, "OK");
}

export async function plannedCashObligationList(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  filters: PlannedObligationListFilters = {},
  limit = 200
): Promise<ProtoCrudResult<PlannedCashObligationListResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { rows, error } = await plannedCashObligationRepositoryList(
    supabase,
    workspaceId,
    filters,
    limit
  );
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ items: rows, count: rows.length }, "Obligaciones listadas.");
}

export async function plannedCashObligationCreate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: PlannedCashObligationCreateBody
): Promise<ProtoCrudResult<PlannedCashObligation>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const input = {
    companyId: normalizeErpCompanyId(body.company_id),
    title: body.title,
    description: body.description ?? null,
    obligationType: body.obligation_type,
    direction: body.direction ?? "outflow",
    amountEstimated: body.amount_estimated,
    amountFinal: body.amount_final ?? null,
    currencyCode: body.currency_code,
    dueDate: body.due_date,
    expectedPaymentDate: body.expected_payment_date ?? null,
    expectedSource: body.expected_source ?? "unknown",
    expectedAccountId: body.expected_account_id ?? null,
    recurrence: body.recurrence ?? "none",
    status: body.status ?? "planned",
    priority: body.priority ?? "medium",
    affectsCashflow: body.affects_cashflow ?? true,
    reminderDaysBefore: body.reminder_days_before ?? [7, 3, 1],
    source: body.source ?? "manual",
    notes: body.notes ?? null,
    metadata: body.metadata ?? null,
  };

  const validation = validatePlannedCashObligationInput(input);
  if (!validation.ok) return validationFailure(validation.issues);

  const accountCheck = await ensureExpectedAccount(
    supabase,
    workspaceId,
    input.expectedAccountId,
    input.currencyCode
  );
  if (!accountCheck.ok) return accountCheck;

  const { row, error } = await plannedCashObligationRepositoryInsert(supabase, workspaceId, {
    company_id: input.companyId,
    title: input.title,
    description: input.description,
    obligation_type: input.obligationType,
    direction: input.direction,
    amount_estimated: input.amountEstimated,
    amount_final: input.amountFinal,
    currency_code: input.currencyCode,
    due_date: input.dueDate,
    expected_payment_date: input.expectedPaymentDate,
    expected_source: input.expectedSource,
    expected_account_id: input.expectedAccountId,
    recurrence: input.recurrence,
    status: input.status,
    priority: input.priority,
    affects_cashflow: input.affectsCashflow,
    reminder_days_before: input.reminderDaysBefore,
    source: input.source,
    notes: input.notes,
    metadata: input.metadata,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("DATABASE", "No se pudo crear la obligación.");
  return protoCrudResult.ok(row, "Obligación creada.");
}

export async function plannedCashObligationUpdate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  body: PlannedCashObligationUpdateBody
): Promise<ProtoCrudResult<PlannedCashObligation>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await plannedCashObligationRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Obligación no encontrada.");

  const merged = {
    companyId:
      body.company_id !== undefined
        ? normalizeErpCompanyId(body.company_id)
        : existing.row.companyId,
    title: body.title ?? existing.row.title,
    description: body.description !== undefined ? body.description : existing.row.description,
    obligationType: body.obligation_type ?? existing.row.obligationType,
    direction: body.direction ?? existing.row.direction,
    amountEstimated: body.amount_estimated ?? existing.row.amountEstimated,
    amountFinal: body.amount_final !== undefined ? body.amount_final : existing.row.amountFinal,
    currencyCode: body.currency_code ?? existing.row.currencyCode,
    dueDate: body.due_date ?? existing.row.dueDate,
    expectedPaymentDate:
      body.expected_payment_date !== undefined
        ? body.expected_payment_date
        : existing.row.expectedPaymentDate,
    expectedSource: body.expected_source ?? existing.row.expectedSource,
    expectedAccountId:
      body.expected_account_id !== undefined
        ? body.expected_account_id
        : existing.row.expectedAccountId,
    recurrence: body.recurrence ?? existing.row.recurrence,
    status: body.status ?? existing.row.status,
    priority: body.priority ?? existing.row.priority,
    affectsCashflow: body.affects_cashflow ?? existing.row.affectsCashflow,
    reminderDaysBefore: body.reminder_days_before ?? existing.row.reminderDaysBefore,
    source: body.source ?? existing.row.source,
    notes: body.notes !== undefined ? body.notes : existing.row.notes,
    metadata: body.metadata !== undefined ? body.metadata : existing.row.metadata,
  };

  const validation = validatePlannedCashObligationInput(merged);
  if (!validation.ok) return validationFailure(validation.issues);

  const accountCheck = await ensureExpectedAccount(
    supabase,
    workspaceId,
    merged.expectedAccountId,
    merged.currencyCode
  );
  if (!accountCheck.ok) return accountCheck;

  const { row, error } = await plannedCashObligationRepositoryUpdate(supabase, workspaceId, id, {
    company_id: merged.companyId,
    title: merged.title,
    description: merged.description,
    obligation_type: merged.obligationType,
    direction: merged.direction,
    amount_estimated: merged.amountEstimated,
    amount_final: merged.amountFinal,
    currency_code: merged.currencyCode,
    due_date: merged.dueDate,
    expected_payment_date: merged.expectedPaymentDate,
    expected_source: merged.expectedSource,
    expected_account_id: merged.expectedAccountId,
    recurrence: merged.recurrence,
    status: merged.status,
    priority: merged.priority,
    affects_cashflow: merged.affectsCashflow,
    reminder_days_before: merged.reminderDaysBefore,
    source: merged.source,
    notes: merged.notes,
    metadata: merged.metadata,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Obligación no encontrada.");
  return protoCrudResult.ok(row, "Obligación actualizada.");
}

export async function plannedCashObligationConfirm(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  notes: string | null | undefined
): Promise<ProtoCrudResult<PlannedCashObligation>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await plannedCashObligationRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Obligación no encontrada.");
  if (existing.row.status === "paid" || existing.row.status === "cancelled") {
    return protoCrudResult.fail("VALIDATION", "La obligación ya está cerrada.");
  }

  const { row, error } = await plannedCashObligationRepositoryUpdate(supabase, workspaceId, id, {
    status: "confirmed",
    notes: notes !== undefined ? notes : existing.row.notes,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Obligación no encontrada.");
  return protoCrudResult.ok(row, "Obligación confirmada.");
}

export async function plannedCashObligationMarkPaid(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  amountFinal: number | undefined,
  notes: string | null | undefined
): Promise<ProtoCrudResult<PlannedCashObligation>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await plannedCashObligationRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Obligación no encontrada.");
  if (existing.row.status === "cancelled") {
    return protoCrudResult.fail("VALIDATION", "No se puede pagar una obligación cancelada.");
  }

  const finalAmount = amountFinal ?? existing.row.amountFinal ?? existing.row.amountEstimated;
  if (finalAmount <= 0) {
    return protoCrudResult.fail("VALIDATION", "amount_final debe ser > 0.");
  }

  const { row, error } = await plannedCashObligationRepositoryUpdate(supabase, workspaceId, id, {
    status: "paid",
    amount_final: finalAmount,
    notes: notes !== undefined ? notes : existing.row.notes,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Obligación no encontrada.");
  return protoCrudResult.ok(row, "Obligación marcada como pagada.");
}

export async function plannedCashObligationCancel(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  notes: string | null | undefined
): Promise<ProtoCrudResult<PlannedCashObligation>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const existing = await plannedCashObligationRepositoryGetById(supabase, workspaceId, id);
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) return protoCrudResult.fail("NOT_FOUND", "Obligación no encontrada.");
  if (existing.row.status === "paid") {
    return protoCrudResult.fail("VALIDATION", "No se puede cancelar una obligación pagada.");
  }

  const { row, error } = await plannedCashObligationRepositoryUpdate(supabase, workspaceId, id, {
    status: "cancelled",
    notes: notes !== undefined ? notes : existing.row.notes,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Obligación no encontrada.");
  return protoCrudResult.ok(row, "Obligación cancelada.");
}

export async function plannedCashObligationUpcoming(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  withinDays = 30,
  asOfDate = todayYmdUtc(),
  limit = 200,
  inactiveRecurringTemplateIds: ReadonlySet<string> = new Set()
): Promise<ProtoCrudResult<PlannedCashObligationListResult>> {
  const listed = await plannedCashObligationList(supabase, tenantCompanyId, {}, limit);
  if (!listed.ok) return listed;
  const eligible = filterPlannedCashObligationsForScheduledOutflow(
    listed.data.items,
    inactiveRecurringTemplateIds
  );
  const items = filterUpcomingObligations(eligible, asOfDate, withinDays);
  return protoCrudResult.ok({ items, count: items.length }, "Obligaciones próximas listadas.");
}

export async function plannedCashObligationOverdue(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  asOfDate = todayYmdUtc(),
  limit = 200,
  inactiveRecurringTemplateIds: ReadonlySet<string> = new Set()
): Promise<ProtoCrudResult<PlannedCashObligationListResult>> {
  const listed = await plannedCashObligationList(supabase, tenantCompanyId, {}, limit);
  if (!listed.ok) return listed;
  const eligible = filterPlannedCashObligationsForScheduledOutflow(
    listed.data.items,
    inactiveRecurringTemplateIds
  );
  const items = filterOverdueObligations(eligible, asOfDate);
  return protoCrudResult.ok({ items, count: items.length }, "Obligaciones vencidas listadas.");
}
