/**
 * Pagos recurrentes — facade sobre `planned_cash_obligation_templates` (ZETA-12).
 * Genera `planned_cash_obligations` sin duplicar instancias.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  RecurringObligationGenerateBody,
  RecurringObligationTemplateCreateBody,
  RecurringObligationTemplateUpdateBody,
} from "@/lib/api/schemas/treasury-api-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import { plannedCashObligationRepositoryListByRecurringTemplate } from "@/lib/treasury/repositories/planned-cash-obligation-repository";
import {
  recurringObligationGenerate,
  recurringObligationTemplateCreate,
  recurringObligationTemplateGetById,
  recurringObligationTemplateList,
  recurringObligationTemplateUpdate,
  type RecurringObligationGenerateResult,
} from "@/lib/treasury/services/recurring-obligation-template-service";
import { plannedCashObligationCancel } from "@/lib/treasury/services/planned-cash-obligation-service";
import { mapDbError } from "@/lib/treasury/treasury-db-helpers";
import { resolveTreasuryWorkspaceId } from "@/lib/treasury/treasury-tenant";
import type {
  PlannedCashObligationTemplate,
  RecurringObligationType,
} from "@/lib/treasury/treasury-recurring-obligations";

export const RECURRING_PAYMENT_CATEGORIES = [
  "Sueldos",
  "Servicios",
  "Impuestos",
  "Alquiler",
  "DGI",
  "BPS",
  "Proveedores",
  "Préstamos",
  "Suscripciones",
  "Otros",
] as const;

export type RecurringPaymentCategory = (typeof RECURRING_PAYMENT_CATEGORIES)[number];

/** Alias de plantilla recurrente para UI/API. */
export type TreasuryRecurringPayment = PlannedCashObligationTemplate & {
  direction: "income" | "expense";
  startsOn: string | null;
  endsOn: string | null;
  dayOfMonth: number | null;
};

export function buildRecurringInstanceKey(templateId: string, dueDate: string): string {
  return `${templateId.trim()}:${dueDate.trim()}`;
}

export function mapTemplateToRecurringPayment(
  template: PlannedCashObligationTemplate
): TreasuryRecurringPayment {
  const meta = template.metadata ?? {};
  const direction =
    meta.direction === "income" || meta.direction === "expense"
      ? meta.direction
      : "expense";
  return {
    ...template,
    direction,
    startsOn:
      typeof meta.starts_on === "string"
        ? meta.starts_on
        : template.nextOccurrenceDate,
    endsOn: typeof meta.ends_on === "string" ? meta.ends_on : null,
    dayOfMonth:
      typeof meta.day_of_month === "number" && Number.isFinite(meta.day_of_month)
        ? meta.day_of_month
        : null,
  };
}

export function frequencyToRecurrenceType(
  frequency: "weekly" | "monthly" | "yearly"
): RecurringObligationType {
  if (frequency === "yearly") return "yearly";
  if (frequency === "weekly") return "custom";
  return "monthly";
}

export async function listRecurringPayments(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  activeOnly = false
): Promise<ProtoCrudResult<{ items: TreasuryRecurringPayment[]; count: number }>> {
  const result = await recurringObligationTemplateList(supabase, tenantCompanyId, activeOnly);
  if (!result.ok) return result;
  const items = result.data.items.map(mapTemplateToRecurringPayment);
  return protoCrudResult.ok({ items, count: items.length }, result.message);
}

export type RecurringPaymentCreateInput = {
  title: string;
  direction: "income" | "expense";
  category: string;
  currency: "UYU" | "USD";
  amount: number;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth?: number | null;
  startsOn: string;
  endsOn?: string | null;
  autoGenerate?: boolean;
  notes?: string | null;
};

export async function createRecurringPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  input: RecurringPaymentCreateInput
): Promise<ProtoCrudResult<TreasuryRecurringPayment>> {
  const recurrenceType = frequencyToRecurrenceType(input.frequency);
  const interval = input.frequency === "weekly" ? 7 : 1;
  let nextDate = input.startsOn;
  if (input.dayOfMonth != null && input.frequency === "monthly") {
    const [y, m] = input.startsOn.split("-");
    const day = Math.min(31, Math.max(1, input.dayOfMonth));
    nextDate = `${y}-${m}-${String(day).padStart(2, "0")}`;
  }

  const body: RecurringObligationTemplateCreateBody = {
    title: input.title,
    category: input.category,
    currency: input.currency,
    amount: input.amount,
    recurrence_type: recurrenceType,
    recurrence_interval: interval,
    next_occurrence_date: nextDate,
    auto_generate: input.autoGenerate ?? true,
    active: true,
    metadata: {
      direction: input.direction,
      starts_on: input.startsOn,
      ends_on: input.endsOn ?? null,
      day_of_month: input.dayOfMonth ?? null,
      frequency: input.frequency,
      notes: input.notes ?? null,
    },
  };

  const result = await recurringObligationTemplateCreate(supabase, tenantCompanyId, body);
  if (!result.ok) return result;
  return protoCrudResult.ok(mapTemplateToRecurringPayment(result.data), result.message);
}

export async function updateRecurringPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  input: Partial<RecurringPaymentCreateInput> & { active?: boolean }
): Promise<ProtoCrudResult<TreasuryRecurringPayment>> {
  const patch: RecurringObligationTemplateUpdateBody = {};
  if (input.title != null) patch.title = input.title;
  if (input.category != null) patch.category = input.category;
  if (input.currency != null) patch.currency = input.currency;
  if (input.amount != null) patch.amount = input.amount;
  if (input.frequency != null) {
    patch.recurrence_type = frequencyToRecurrenceType(input.frequency);
    patch.recurrence_interval = input.frequency === "weekly" ? 7 : 1;
  }
  if (input.startsOn != null) patch.next_occurrence_date = input.startsOn;
  if (input.autoGenerate != null) patch.auto_generate = input.autoGenerate;
  if (input.active != null) patch.active = input.active;

  const metaPatch: Record<string, unknown> = {};
  if (input.direction != null) metaPatch.direction = input.direction;
  if (input.startsOn != null) metaPatch.starts_on = input.startsOn;
  if (input.endsOn !== undefined) metaPatch.ends_on = input.endsOn;
  if (input.dayOfMonth !== undefined) metaPatch.day_of_month = input.dayOfMonth;
  if (input.frequency != null) metaPatch.frequency = input.frequency;
  if (input.notes !== undefined) metaPatch.notes = input.notes;
  if (Object.keys(metaPatch).length > 0) {
    const existing = await recurringObligationTemplateGetById(supabase, tenantCompanyId, id);
    if (!existing.ok) return existing;
    patch.metadata = { ...(existing.data.metadata ?? {}), ...metaPatch };
  }

  const result = await recurringObligationTemplateUpdate(
    supabase,
    tenantCompanyId,
    id,
    patch
  );
  if (!result.ok) return result;
  return protoCrudResult.ok(mapTemplateToRecurringPayment(result.data), result.message);
}

export async function pauseRecurringPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<ProtoCrudResult<TreasuryRecurringPayment>> {
  return updateRecurringPayment(supabase, tenantCompanyId, id, { active: false });
}

export async function cancelRecurringPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<ProtoCrudResult<TreasuryRecurringPayment>> {
  return updateRecurringPayment(supabase, tenantCompanyId, id, {
    active: false,
    autoGenerate: false,
  });
}

export function mapRecurringTemplateUpdateBodyToInput(
  body: RecurringObligationTemplateUpdateBody
): Partial<RecurringPaymentCreateInput> & { active?: boolean; autoGenerate?: boolean } {
  const meta = (body.metadata ?? {}) as Record<string, unknown>;
  const frequency = meta.frequency;
  const out: Partial<RecurringPaymentCreateInput> & { active?: boolean; autoGenerate?: boolean } =
    {};
  if (body.title != null) out.title = body.title;
  if (body.category != null) out.category = body.category;
  if (body.currency != null) out.currency = body.currency;
  if (body.amount != null) out.amount = body.amount;
  if (body.next_occurrence_date != null) out.startsOn = body.next_occurrence_date;
  if (body.active != null) out.active = body.active;
  if (body.auto_generate != null) out.autoGenerate = body.auto_generate;
  if (meta.direction === "income" || meta.direction === "expense") {
    out.direction = meta.direction;
  }
  if (typeof meta.starts_on === "string") out.startsOn = meta.starts_on;
  if (meta.ends_on === null || typeof meta.ends_on === "string") {
    out.endsOn = meta.ends_on as string | null;
  }
  if (typeof meta.day_of_month === "number") out.dayOfMonth = meta.day_of_month;
  if (meta.notes === null || typeof meta.notes === "string") out.notes = meta.notes as string | null;
  if (frequency === "weekly" || frequency === "monthly" || frequency === "yearly") {
    out.frequency = frequency;
  } else if (body.recurrence_type === "yearly") {
    out.frequency = "yearly";
  } else if (body.recurrence_type === "custom" && body.recurrence_interval === 7) {
    out.frequency = "weekly";
  } else if (body.recurrence_type != null) {
    out.frequency = "monthly";
  }
  return out;
}

export type DeleteRecurringPaymentOptions = {
  /** Si true, cancela obligaciones pendientes generadas por esta plantilla (no pagadas). */
  cancelPendingObligations?: boolean;
};

export type DeleteRecurringPaymentResult = {
  payment: TreasuryRecurringPayment;
  cancelledObligationCount: number;
};

export async function deleteRecurringPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  options: DeleteRecurringPaymentOptions = {}
): Promise<ProtoCrudResult<DeleteRecurringPaymentResult>> {
  const existing = await getRecurringPaymentById(supabase, tenantCompanyId, id);
  if (!existing.ok) return existing;

  const deactivated = await cancelRecurringPayment(supabase, tenantCompanyId, id);
  if (!deactivated.ok) return deactivated;

  let cancelledObligationCount = 0;
  if (options.cancelPendingObligations) {
    const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
    const { rows, error } = await plannedCashObligationRepositoryListByRecurringTemplate(
      supabase,
      workspaceId,
      id
    );
    if (error) return mapDbError(error);

    for (const row of rows) {
      if (row.status === "paid" || row.status === "cancelled") continue;
      const cancelled = await plannedCashObligationCancel(
        supabase,
        tenantCompanyId,
        row.id,
        "Cancelado al eliminar recurrente."
      );
      if (cancelled.ok) cancelledObligationCount += 1;
    }
  }

  return protoCrudResult.ok(
    { payment: deactivated.data, cancelledObligationCount },
    options.cancelPendingObligations && cancelledObligationCount > 0
      ? `Recurrente eliminado. ${cancelledObligationCount} pago(s) futuro(s) pendiente(s) cancelado(s).`
      : "Recurrente eliminado. No se generarán nuevos pagos futuros."
  );
}

export async function generateDueObligationsFromRecurring(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  horizonDays = 30,
  asOfDate?: string
): Promise<ProtoCrudResult<RecurringObligationGenerateResult>> {
  const body: RecurringObligationGenerateBody = {
    within_days: horizonDays,
    as_of_date: asOfDate,
    persist: true,
  };
  return recurringObligationGenerate(supabase, tenantCompanyId, body);
}

export async function getRecurringPaymentById(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<ProtoCrudResult<TreasuryRecurringPayment>> {
  const result = await recurringObligationTemplateGetById(supabase, tenantCompanyId, id);
  if (!result.ok) return result;
  return protoCrudResult.ok(mapTemplateToRecurringPayment(result.data), result.message);
}

export function isRecurringGeneratedObligation(obligation: {
  source: string;
  metadata?: Record<string, unknown> | null;
  recurringTemplateId?: string | null;
}): boolean {
  if (obligation.recurringTemplateId) return true;
  if (obligation.source === "recurring_rule") return true;
  const key = obligation.metadata?.recurring_instance_key;
  return typeof key === "string" && key.includes(":");
}
