import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  RecurringObligationGenerateBody,
  RecurringObligationTemplateCreateBody,
  RecurringObligationTemplateUpdateBody,
} from "@/lib/api/schemas/treasury-api-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  recurringObligationTemplateRepositoryGetById,
  recurringObligationTemplateRepositoryInsert,
  recurringObligationTemplateRepositoryList,
  recurringObligationTemplateRepositoryUpdate,
} from "@/lib/treasury/repositories/recurring-obligation-template-repository";
import { plannedCashObligationRepositoryInsert } from "@/lib/treasury/repositories/planned-cash-obligation-repository";
import { mapDbError, todayYmdUtc, validationFailure } from "@/lib/treasury/treasury-db-helpers";
import {
  buildNextOccurrence,
  generateUpcomingObligations,
  type GeneratedObligationDraft,
  type PlannedCashObligationTemplate,
} from "@/lib/treasury/treasury-recurring-obligations";
import { resolveTreasuryWorkspaceId } from "@/lib/treasury/treasury-tenant";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";
import { validatePlannedCashObligationInput } from "@/lib/treasury/treasury-validation";

export type RecurringObligationTemplateListResult = {
  items: PlannedCashObligationTemplate[];
  count: number;
};

export type RecurringObligationGenerateResult = {
  drafts: GeneratedObligationDraft[];
  created: PlannedCashObligation[];
};

export async function recurringObligationTemplateList(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  activeOnly = false
): Promise<ProtoCrudResult<RecurringObligationTemplateListResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { rows, error } = await recurringObligationTemplateRepositoryList(
    supabase,
    workspaceId,
    activeOnly
  );
  if (error) return mapDbError(error);
  return protoCrudResult.ok({ items: rows, count: rows.length }, "Plantillas listadas.");
}

export async function recurringObligationTemplateCreate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: RecurringObligationTemplateCreateBody
): Promise<ProtoCrudResult<PlannedCashObligationTemplate>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { row, error } = await recurringObligationTemplateRepositoryInsert(supabase, workspaceId, {
    title: body.title,
    category: body.category,
    currency: body.currency,
    amount: body.amount,
    recurrence_type: body.recurrence_type,
    recurrence_interval: body.recurrence_interval ?? 1,
    next_occurrence_date: body.next_occurrence_date,
    auto_generate: body.auto_generate ?? true,
    active: body.active ?? true,
    metadata: body.metadata ?? null,
  });
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("DATABASE", "No se pudo crear la plantilla.");
  return protoCrudResult.ok(row, "Plantilla creada.");
}

export async function recurringObligationTemplateUpdate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  body: RecurringObligationTemplateUpdateBody
): Promise<ProtoCrudResult<PlannedCashObligationTemplate>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const payload: Record<string, unknown> = {};
  if (body.title != null) payload.title = body.title;
  if (body.category != null) payload.category = body.category;
  if (body.currency != null) payload.currency = body.currency;
  if (body.amount != null) payload.amount = body.amount;
  if (body.recurrence_type != null) payload.recurrence_type = body.recurrence_type;
  if (body.recurrence_interval != null) payload.recurrence_interval = body.recurrence_interval;
  if (body.next_occurrence_date != null) payload.next_occurrence_date = body.next_occurrence_date;
  if (body.auto_generate != null) payload.auto_generate = body.auto_generate;
  if (body.active != null) payload.active = body.active;
  if (body.metadata !== undefined) payload.metadata = body.metadata;

  const { row, error } = await recurringObligationTemplateRepositoryUpdate(
    supabase,
    workspaceId,
    id,
    payload
  );
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Plantilla no encontrada.");
  return protoCrudResult.ok(row, "Plantilla actualizada.");
}

export async function recurringObligationGenerate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: RecurringObligationGenerateBody
): Promise<ProtoCrudResult<RecurringObligationGenerateResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const asOfDate = body.as_of_date ?? todayYmdUtc();
  const withinDays = body.within_days ?? 60;

  const { rows, error } = await recurringObligationTemplateRepositoryList(
    supabase,
    workspaceId,
    true
  );
  if (error) return mapDbError(error);

  const drafts = generateUpcomingObligations({
    templates: rows,
    asOfDate,
    withinDays,
  });

  if (!body.persist) {
    return protoCrudResult.ok({ drafts, created: [] }, "Borrador de obligaciones generado.");
  }

  const created: PlannedCashObligation[] = [];
  for (const draft of drafts) {
    const validation = validatePlannedCashObligationInput(draft.input);
    if (!validation.ok) return validationFailure(validation.issues);
    const { row, error: insertError } = await plannedCashObligationRepositoryInsert(
      supabase,
      workspaceId,
      {
        company_id: null,
        title: draft.input.title,
        description: draft.input.description ?? null,
        obligation_type: draft.input.obligationType,
        direction: draft.input.direction ?? "outflow",
        amount_estimated: draft.input.amountEstimated,
        amount_final: draft.input.amountFinal ?? null,
        currency_code: draft.input.currencyCode,
        due_date: draft.input.dueDate,
        expected_payment_date: draft.input.expectedPaymentDate ?? null,
        expected_source: draft.input.expectedSource ?? "unknown",
        expected_account_id: draft.input.expectedAccountId ?? null,
        recurrence: draft.input.recurrence ?? "none",
        status: draft.input.status ?? "planned",
        priority: draft.input.priority ?? "medium",
        affects_cashflow: draft.input.affectsCashflow ?? true,
        reminder_days_before: draft.input.reminderDaysBefore ?? [7, 3, 1],
        source: draft.input.source ?? "recurring_rule",
        notes: draft.input.notes ?? null,
        metadata: draft.input.metadata ?? null,
      }
    );
    if (insertError) return mapDbError(insertError);
    if (!row) continue;
    created.push(row);

    const template = rows.find((item) => item.id === draft.templateId);
    if (!template) continue;
    const nextOccurrence = buildNextOccurrence(
      draft.dueDate,
      template.recurrenceType,
      template.recurrenceInterval
    );
    if (!nextOccurrence) continue;
    await recurringObligationTemplateRepositoryUpdate(supabase, workspaceId, template.id, {
      next_occurrence_date: nextOccurrence,
    });
  }

  return protoCrudResult.ok({ drafts, created }, "Obligaciones recurrentes generadas.");
}

export async function recurringObligationTemplateGetById(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<ProtoCrudResult<PlannedCashObligationTemplate>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { row, error } = await recurringObligationTemplateRepositoryGetById(
    supabase,
    workspaceId,
    id
  );
  if (error) return mapDbError(error);
  if (!row) return protoCrudResult.fail("NOT_FOUND", "Plantilla no encontrada.");
  return protoCrudResult.ok(row, "Plantilla encontrada.");
}
