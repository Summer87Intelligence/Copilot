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
import {
  plannedCashObligationRepositoryFindByInstanceKey,
  plannedCashObligationRepositoryInsert,
} from "@/lib/treasury/repositories/planned-cash-obligation-repository";
import { mapDbError, todayYmdUtc, validationFailure } from "@/lib/treasury/treasury-db-helpers";
import {
  buildNextOccurrence,
  createGeneratedObligation,
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

async function insertObligationFromDraft(
  supabase: SupabaseClient,
  workspaceId: string,
  draft: GeneratedObligationDraft
): Promise<{ row: PlannedCashObligation | null; error: { message?: string } | null }> {
  return plannedCashObligationRepositoryInsert(supabase, workspaceId, {
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
    recurring_template_id: draft.templateId,
    recurring_instance_key: draft.recurringInstanceKey,
    notes: draft.input.notes ?? null,
    metadata: draft.input.metadata ?? null,
  });
}

/**
 * Fecha que debe quedar como `next_occurrence_date` tras resolver el ciclo
 * de `dueDate`: si quedó pagado/cancelado, o si venció sin generarse a
 * tiempo (atrasado), se avanza al ciclo siguiente. Si quedó abierto y no
 * está atrasado (recién creado o ya existente), el puntero apunta a ese
 * mismo ciclo — es la "próxima instancia abierta" que el usuario debe ver.
 */
export function nextPointerAfterResolving(
  dueDate: string,
  status: PlannedCashObligation["status"] | "open_new",
  asOfDate: string,
  template: Pick<PlannedCashObligationTemplate, "recurrenceType" | "recurrenceInterval">
): string | null {
  const isResolved = status === "paid" || status === "cancelled";
  const isOverdue = dueDate < asOfDate;
  if (isResolved || isOverdue) {
    return buildNextOccurrence(dueDate, template.recurrenceType, template.recurrenceInterval);
  }
  return dueDate;
}

async function persistGeneratedObligationDrafts(
  supabase: SupabaseClient,
  workspaceId: string,
  drafts: readonly GeneratedObligationDraft[],
  templates: readonly PlannedCashObligationTemplate[],
  asOfDate: string
): Promise<ProtoCrudResult<PlannedCashObligation[]>> {
  const created: PlannedCashObligation[] = [];
  for (const draft of drafts) {
    const existing = await plannedCashObligationRepositoryFindByInstanceKey(
      supabase,
      workspaceId,
      draft.recurringInstanceKey
    );
    if (existing.error) return mapDbError(existing.error);

    // El ciclo ya está resuelto (obligación creada antes, en cualquier
    // estado). No se duplica, pero el puntero de la plantilla igual debe
    // actualizarse más abajo.
    let resolvedStatus: PlannedCashObligation["status"] | "open_new";
    if (!existing.row) {
      const validation = validatePlannedCashObligationInput(draft.input);
      if (!validation.ok) return validationFailure(validation.issues);
      const { row, error: insertError } = await insertObligationFromDraft(
        supabase,
        workspaceId,
        draft
      );
      if (insertError && !String(insertError.message ?? "").includes("recurring_instance")) {
        return mapDbError(insertError);
      }
      if (row) created.push(row);
      resolvedStatus = "open_new";
    } else {
      resolvedStatus = existing.row.status;
    }

    const template = templates.find((item) => item.id === draft.templateId);
    if (!template) continue;
    const nextOccurrence = nextPointerAfterResolving(
      draft.dueDate,
      resolvedStatus,
      asOfDate,
      template
    );
    if (!nextOccurrence) continue;
    await recurringObligationTemplateRepositoryUpdate(supabase, workspaceId, template.id, {
      next_occurrence_date: nextOccurrence,
    });
  }

  return protoCrudResult.ok(created, "Obligaciones recurrentes generadas.");
}

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

  const persisted = await persistGeneratedObligationDrafts(
    supabase,
    workspaceId,
    drafts,
    rows,
    asOfDate
  );
  if (!persisted.ok) return persisted;

  return protoCrudResult.ok(
    { drafts, created: persisted.data },
    "Obligaciones recurrentes generadas."
  );
}

/**
 * Asegura que una plantilla recurrente activa tenga materializado y
 * apuntado su próximo ciclo abierto. Pensado para llamarse justo después
 * de marcar como pagada una obligación generada por esa plantilla: si el
 * ciclo que se acaba de pagar era el que apuntaba `next_occurrence_date`,
 * avanza y materializa el siguiente (sin duplicar si ya existe, y sin
 * saltar más allá del primer ciclo que quede abierto/no resuelto).
 */
export async function recurringObligationEnsureNextForTemplate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  templateId: string,
  asOfDate: string = todayYmdUtc()
): Promise<ProtoCrudResult<PlannedCashObligation[]>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const { row: template, error } = await recurringObligationTemplateRepositoryGetById(
    supabase,
    workspaceId,
    templateId
  );
  if (error) return mapDbError(error);
  if (!template || !template.active || !template.autoGenerate) {
    return protoCrudResult.ok([], "Plantilla inactiva o sin autogeneración.");
  }

  const created: PlannedCashObligation[] = [];
  let cursor = template.nextOccurrenceDate;

  // Tope de seguridad: nunca debería requerir más de un puñado de ciclos
  // para llegar al primer mes abierto, salvo templates muy desatendidos.
  for (let step = 0; step < 6; step += 1) {
    const instanceKey = `${template.id}:${cursor}`;
    const existing = await plannedCashObligationRepositoryFindByInstanceKey(
      supabase,
      workspaceId,
      instanceKey
    );
    if (existing.error) return mapDbError(existing.error);

    let resolvedStatus: PlannedCashObligation["status"] | "open_new";
    if (!existing.row) {
      const draft = createGeneratedObligation(template, cursor);
      const validation = validatePlannedCashObligationInput(draft.input);
      if (!validation.ok) return validationFailure(validation.issues);
      const { row, error: insertError } = await insertObligationFromDraft(
        supabase,
        workspaceId,
        draft
      );
      if (insertError && !String(insertError.message ?? "").includes("recurring_instance")) {
        return mapDbError(insertError);
      }
      if (row) created.push(row);
      resolvedStatus = "open_new";
    } else {
      resolvedStatus = existing.row.status;
    }

    const nextOccurrence = nextPointerAfterResolving(cursor, resolvedStatus, asOfDate, template);
    if (!nextOccurrence) {
      return protoCrudResult.ok(created, "No se pudo calcular el siguiente ciclo.");
    }
    await recurringObligationTemplateRepositoryUpdate(supabase, workspaceId, template.id, {
      next_occurrence_date: nextOccurrence,
    });

    const isResolved = resolvedStatus === "paid" || resolvedStatus === "cancelled";
    if (!isResolved) {
      return protoCrudResult.ok(created, "Próxima obligación recurrente asegurada.");
    }
    cursor = nextOccurrence;
  }

  return protoCrudResult.ok(
    created,
    "Próxima obligación recurrente asegurada (límite de iteración alcanzado)."
  );
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
