/**
 * Pagos programados de tesorería — capa de dominio sobre `planned_cash_obligations`.
 * Sin conversión de moneda. Sin LLM.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ScheduledPaymentCancelBody,
  ScheduledPaymentCreateBody,
  ScheduledPaymentMarkPaidBody,
  ScheduledPaymentUpdateBody,
} from "@/lib/api/schemas/treasury-scheduled-payment-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  plannedCashObligationRepositoryDelete,
  plannedCashObligationRepositoryGetById,
  plannedCashObligationRepositoryUpdate,
} from "@/lib/treasury/repositories/planned-cash-obligation-repository";
import { manualCashMovementCreate } from "@/lib/treasury/services/manual-cash-movement-service";
import { todayYmdUtc } from "@/lib/treasury/treasury-db-helpers";
import {
  plannedCashObligationCancel,
  plannedCashObligationCreate,
  plannedCashObligationList,
  plannedCashObligationMarkPaid,
  plannedCashObligationUpdate,
} from "@/lib/treasury/services/planned-cash-obligation-service";
import { mapDbError } from "@/lib/treasury/treasury-db-helpers";
import { resolveTreasuryWorkspaceId } from "@/lib/treasury/treasury-tenant";
import {
  buildInactiveRecurringTemplateIdSet,
  filterPlannedCashObligationsForScheduledOutflow,
  shouldIncludePlannedObligationInScheduledOutflow,
} from "@/lib/treasury/treasury-scheduled-outflow-eligibility";
import {
  daysUntilDue,
  effectivePlannedObligationStatus,
  isPlannedObligationOverdue,
  isPlannedObligationPendingForCashflow,
} from "@/lib/treasury/treasury-obligation-status";
import type {
  PlannedCashObligation,
  PlannedObligationType,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export type ScheduledPaymentCategory =
  | "DGI"
  | "BPS"
  | "Sueldos"
  | "Proveedores"
  | "Alquiler"
  | "Préstamos"
  | "Servicios"
  | "Suscripciones"
  | "Otros";

export const SCHEDULED_PAYMENT_CATEGORIES: ScheduledPaymentCategory[] = [
  "DGI",
  "BPS",
  "Sueldos",
  "Proveedores",
  "Alquiler",
  "Préstamos",
  "Servicios",
  "Suscripciones",
  "Otros",
];

/** Vista API amigable (alias de PlannedCashObligation). */
export type TreasuryScheduledPayment = {
  id: string;
  workspaceId: string;
  name: string;
  category: ScheduledPaymentCategory;
  obligationType: PlannedObligationType;
  currency: TreasuryCurrencyCode;
  amount: number;
  dueDate: string;
  status: "scheduled" | "paid" | "cancelled" | "overdue";
  recurrence: PlannedCashObligation["recurrence"];
  source: PlannedCashObligation["source"];
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Etiqueta de categoría del recurrente (ej. Suscripciones), si aplica. */
  recurringCategoryLabel: string | null;
};

export type TreasuryOutflowSummary = {
  currency: TreasuryCurrencyCode;
  totalScheduled: number;
  overdue: number;
  next7Days: number;
  /** Pagos pendientes hasta fin del mes actual (horizonte del sistema). */
  scheduledTotal: number;
  paidInPeriod: number;
  itemsCount: number;
  byCategory: Array<{
    category: ScheduledPaymentCategory;
    amount: number;
    count: number;
  }>;
};

export type ScheduledPaymentsRange = {
  asOfDate: string;
  /** Fin inclusive para ventana de proyección (ej. hoy + 30). */
  horizonEndDate: string;
  /** Inicio del período para “pagados del período” (opcional). */
  periodStartDate?: string;
  periodEndDate?: string;
  /**
   * Plantillas recurrentes inactivas (paused/cancelled). Sus obligaciones pendientes
   * no cuentan en Hoy ni en resúmenes de egresos programados.
   */
  inactiveRecurringTemplateIds?: ReadonlySet<string>;
};

const CATEGORY_TO_TYPE: Record<ScheduledPaymentCategory, PlannedObligationType> = {
  DGI: "dgi",
  BPS: "bps",
  Sueldos: "salary",
  Proveedores: "supplier",
  Alquiler: "rent",
  Préstamos: "loan",
  Servicios: "service",
  Suscripciones: "service",
  Otros: "other",
};

const TYPE_TO_CATEGORY: Record<PlannedObligationType, ScheduledPaymentCategory> = {
  tax: "Otros",
  bps: "BPS",
  dgi: "DGI",
  iva: "Otros",
  salary: "Sueldos",
  bonus: "Sueldos",
  vacation: "Sueldos",
  supplier: "Proveedores",
  rent: "Alquiler",
  loan: "Préstamos",
  travel: "Otros",
  service: "Servicios",
  other: "Otros",
};

export function scheduledCategoryToObligationType(
  category: ScheduledPaymentCategory
): PlannedObligationType {
  return CATEGORY_TO_TYPE[category];
}

export function obligationTypeToScheduledCategory(
  type: PlannedObligationType
): ScheduledPaymentCategory {
  return TYPE_TO_CATEGORY[type] ?? "Otros";
}

function parseYmdToUtcMs(ymd: string): number | null {
  const trimmed = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const ms = Date.parse(`${trimmed}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function addDaysYmd(ymd: string, days: number): string {
  const ms = parseYmdToUtcMs(ymd);
  if (ms == null) return ymd;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function paymentAmount(row: PlannedCashObligation): number {
  return row.amountFinal ?? row.amountEstimated;
}

function mapStatus(
  row: PlannedCashObligation,
  asOfDate: string
): TreasuryScheduledPayment["status"] {
  const effective = effectivePlannedObligationStatus(row.status, row.dueDate, asOfDate);
  if (effective === "paid") return "paid";
  if (effective === "cancelled") return "cancelled";
  if (effective === "overdue") return "overdue";
  return "scheduled";
}

function scheduledCategoryFromRecurringMetadata(
  row: PlannedCashObligation
): ScheduledPaymentCategory | null {
  const raw = row.metadata?.recurring_category;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const label = raw.trim();
  const map: Record<string, ScheduledPaymentCategory> = {
    Suscripciones: "Servicios",
    Servicios: "Servicios",
    Sueldos: "Sueldos",
    Proveedores: "Proveedores",
    Alquiler: "Alquiler",
    Impuestos: "DGI",
    Préstamos: "Préstamos",
    Prestamos: "Préstamos",
    Otros: "Otros",
  };
  return map[label] ?? null;
}

export function mapPlannedObligationToScheduledPayment(
  row: PlannedCashObligation,
  asOfDate: string
): TreasuryScheduledPayment {
  const status = mapStatus(row, asOfDate);
  const recurringCategory = scheduledCategoryFromRecurringMetadata(row);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.title,
    category: recurringCategory ?? obligationTypeToScheduledCategory(row.obligationType),
    obligationType: row.obligationType,
    currency: row.currencyCode,
    amount: paymentAmount(row),
    dueDate: row.dueDate,
    status,
    recurrence: row.recurrence,
    source: row.source,
    notes: row.notes,
    paidAt: status === "paid" ? row.updatedAt : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    recurringCategoryLabel:
      typeof row.metadata?.recurring_category === "string"
        ? row.metadata.recurring_category.trim() || null
        : null,
  };
}

function isOutflowPending(row: PlannedCashObligation, asOfDate: string): boolean {
  if (row.direction !== "outflow" || !row.affectsCashflow) return false;
  return isPlannedObligationPendingForCashflow(row, asOfDate);
}

function dueOnOrBefore(dueDate: string, endYmd: string): boolean {
  const dueMs = parseYmdToUtcMs(dueDate);
  const endMs = parseYmdToUtcMs(endYmd);
  if (dueMs == null || endMs == null) return false;
  return dueMs <= endMs;
}

function dueInPeriod(dueDate: string, startYmd: string, endYmd: string): boolean {
  const dueMs = parseYmdToUtcMs(dueDate);
  const startMs = parseYmdToUtcMs(startYmd);
  const endMs = parseYmdToUtcMs(endYmd);
  if (dueMs == null || startMs == null || endMs == null) return false;
  return dueMs >= startMs && dueMs <= endMs;
}

export function summarizeScheduledOutflows(
  payments: readonly PlannedCashObligation[],
  range: ScheduledPaymentsRange
): TreasuryOutflowSummary[] {
  const asOf = range.asOfDate;
  const horizonEnd = range.horizonEndDate;
  const periodStart = range.periodStartDate ?? asOf;
  const periodEnd = range.periodEndDate ?? horizonEnd;
  const end7 = addDaysYmd(asOf, 7);

  const codes: TreasuryCurrencyCode[] = ["UYU", "USD"];
  const out: TreasuryOutflowSummary[] = [];

  for (const currency of codes) {
    const rows = payments.filter(
      (p) => p.currencyCode === currency && p.direction === "outflow" && p.affectsCashflow
    );

    let totalScheduled = 0;
    let overdue = 0;
    let next7Days = 0;
    let scheduledTotal = 0;
    let paidInPeriod = 0;
    let itemsCount = 0;
    const byCat = new Map<ScheduledPaymentCategory, { amount: number; count: number }>();

    for (const row of rows) {
      const amt = paymentAmount(row);
      const effective = effectivePlannedObligationStatus(row.status, row.dueDate, asOf);

      if (effective === "paid" && dueInPeriod(row.dueDate, periodStart, periodEnd)) {
        paidInPeriod += amt;
        continue;
      }

      if (!isOutflowPending(row, asOf)) continue;

      if (
        range.inactiveRecurringTemplateIds &&
        !shouldIncludePlannedObligationInScheduledOutflow(
          row,
          range.inactiveRecurringTemplateIds
        )
      ) {
        continue;
      }

      if (!dueOnOrBefore(row.dueDate, horizonEnd)) continue;

      itemsCount += 1;
      totalScheduled += amt;
      scheduledTotal += amt;

      const cat = obligationTypeToScheduledCategory(row.obligationType);
      const bucket = byCat.get(cat) ?? { amount: 0, count: 0 };
      bucket.amount += amt;
      bucket.count += 1;
      byCat.set(cat, bucket);

      if (isPlannedObligationOverdue(row, asOf)) {
        overdue += amt;
      } else {
        const days = daysUntilDue(row.dueDate, asOf);
        if (days != null && days >= 0 && days <= 7 && dueOnOrBefore(row.dueDate, end7)) {
          next7Days += amt;
        }
      }
    }

    out.push({
      currency,
      totalScheduled: roundMoney(totalScheduled),
      overdue: roundMoney(overdue),
      next7Days: roundMoney(next7Days),
      scheduledTotal: roundMoney(scheduledTotal),
      paidInPeriod: roundMoney(paidInPeriod),
      itemsCount,
      byCategory: [...byCat.entries()]
        .map(([category, v]) => ({
          category,
          amount: roundMoney(v.amount),
          count: v.count,
        }))
        .sort((a, b) => b.amount - a.amount),
    });
  }

  return out;
}

/** Suma egresos pendientes con vencimiento ≤ horizonEnd (incluye vencidos). */
export function scheduledOutflowsThroughDate(
  payments: readonly PlannedCashObligation[],
  asOfDate: string,
  horizonEndDate: string
): Record<TreasuryCurrencyCode, number> {
  const summaries = summarizeScheduledOutflows(payments, { asOfDate, horizonEndDate });
  return {
    UYU: summaries.find((s) => s.currency === "UYU")?.scheduledTotal ?? 0,
    USD: summaries.find((s) => s.currency === "USD")?.scheduledTotal ?? 0,
  };
}

export type CoverageStatus = "healthy" | "attention" | "critical";

export function projectedBalanceCoverage(
  currentCash: number,
  pendingReceivables: number,
  scheduledOutflows: number
): { projected: number; coverageStatus: CoverageStatus } {
  const projected = roundMoney(currentCash + pendingReceivables - scheduledOutflows);
  if (scheduledOutflows <= 0) {
    return { projected, coverageStatus: projected >= 0 ? "healthy" : "critical" };
  }
  if (projected < 0) return { projected, coverageStatus: "critical" };
  const base = currentCash + pendingReceivables;
  const ratio = base > 0 ? projected / base : 0;
  if (ratio < 0.15) return { projected, coverageStatus: "attention" };
  return { projected, coverageStatus: "healthy" };
}

function createBodyFromScheduled(input: ScheduledPaymentCreateBody) {
  return {
    title: input.name,
    obligation_type: scheduledCategoryToObligationType(input.category),
    direction: "outflow" as const,
    amount_estimated: input.amount,
    currency_code: input.currency,
    due_date: input.due_date,
    recurrence: input.recurrence ?? "none",
    notes: input.notes ?? null,
    source: "manual" as const,
    affects_cashflow: true,
    status: "planned" as const,
  };
}

function updateBodyFromScheduled(input: ScheduledPaymentUpdateBody) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.title = input.name;
  if (input.category !== undefined)
    patch.obligation_type = scheduledCategoryToObligationType(input.category);
  if (input.amount !== undefined) patch.amount_estimated = input.amount;
  if (input.currency !== undefined) patch.currency_code = input.currency;
  if (input.due_date !== undefined) patch.due_date = input.due_date;
  if (input.recurrence !== undefined) patch.recurrence = input.recurrence;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.status !== undefined) {
    patch.status =
      input.status === "scheduled"
        ? "planned"
        : input.status === "paid"
          ? "paid"
          : input.status === "cancelled"
            ? "cancelled"
            : "planned";
  }
  return patch;
}

export {
  buildInactiveRecurringTemplateIdSet,
  filterPlannedCashObligationsForScheduledOutflow,
  resolveRecurringTemplateId,
  shouldIncludePlannedObligationInScheduledOutflow,
} from "@/lib/treasury/treasury-scheduled-outflow-eligibility";

/** Obligaciones que alimentan el listado de Pagos próximos (Hoy): pendientes, en horizonte, template activo. */
export function filterPlannedObligationsForHoyScheduledList(
  payments: readonly PlannedCashObligation[],
  range: Pick<
    ScheduledPaymentsRange,
    "asOfDate" | "horizonEndDate" | "inactiveRecurringTemplateIds"
  >
): PlannedCashObligation[] {
  const inactive = range.inactiveRecurringTemplateIds ?? new Set<string>();
  return filterPlannedCashObligationsForScheduledOutflow(payments, inactive).filter(
    (row) =>
      isOutflowPending(row, range.asOfDate) &&
      dueOnOrBefore(row.dueDate, range.horizonEndDate)
  );
}

export async function loadInactiveRecurringTemplateIds(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<ReadonlySet<string>> {
  const { recurringObligationTemplateList } = await import(
    "@/lib/treasury/services/recurring-obligation-template-service"
  );
  const listed = await recurringObligationTemplateList(supabase, tenantCompanyId, false);
  if (!listed.ok) return new Set<string>();
  return buildInactiveRecurringTemplateIdSet(listed.data.items);
}

export async function listScheduledPayments(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  filters: {
    currencyCode?: TreasuryCurrencyCode;
    fromDate?: string;
    toDate?: string;
    status?: PlannedCashObligation["status"];
    limit?: number;
  } = {}
): Promise<ProtoCrudResult<{ items: TreasuryScheduledPayment[]; count: number }>> {
  const result = await plannedCashObligationList(
    supabase,
    tenantCompanyId,
    {
      currencyCode: filters.currencyCode,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      status: filters.status,
      direction: "outflow",
    },
    filters.limit ?? 500
  );
  if (!result.ok) return result;
  const asOf = new Date().toISOString().slice(0, 10);
  const items = result.data.items.map((row) => mapPlannedObligationToScheduledPayment(row, asOf));
  return protoCrudResult.ok({ items, count: items.length }, result.message);
}

export async function createScheduledPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  input: ScheduledPaymentCreateBody
): Promise<ProtoCrudResult<TreasuryScheduledPayment>> {
  const result = await plannedCashObligationCreate(
    supabase,
    tenantCompanyId,
    createBodyFromScheduled(input)
  );
  if (!result.ok) return result;
  const asOf = new Date().toISOString().slice(0, 10);
  return protoCrudResult.ok(
    mapPlannedObligationToScheduledPayment(result.data, asOf),
    result.message
  );
}

export async function updateScheduledPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  input: ScheduledPaymentUpdateBody
): Promise<ProtoCrudResult<TreasuryScheduledPayment>> {
  const result = await plannedCashObligationUpdate(
    supabase,
    tenantCompanyId,
    id,
    updateBodyFromScheduled(input)
  );
  if (!result.ok) return result;
  const asOf = new Date().toISOString().slice(0, 10);
  return protoCrudResult.ok(
    mapPlannedObligationToScheduledPayment(result.data, asOf),
    result.message
  );
}

export async function markScheduledPaymentAsPaid(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  body?: ScheduledPaymentMarkPaidBody
): Promise<ProtoCrudResult<TreasuryScheduledPayment>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const trimmedId = id?.trim();
  if (!trimmedId) {
    return protoCrudResult.fail("VALIDATION", "Falta el id del pago.");
  }

  const existing = await plannedCashObligationRepositoryGetById(
    supabase,
    workspaceId,
    trimmedId
  );
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) {
    return protoCrudResult.fail("NOT_FOUND", "Pago programado no encontrado.");
  }

  if (body?.register_cash_movement && existing.row.relatedManualMovementId) {
    return protoCrudResult.fail(
      "VALIDATION",
      "Este pago ya tiene un movimiento de caja vinculado."
    );
  }

  const result = await plannedCashObligationMarkPaid(
    supabase,
    tenantCompanyId,
    trimmedId,
    body?.amount_final,
    undefined
  );
  if (!result.ok) return result;

  let obligation = result.data;

  if (body?.register_cash_movement && !obligation.relatedManualMovementId) {
    const finalAmount = obligation.amountFinal ?? obligation.amountEstimated;
    const movement = await manualCashMovementCreate(supabase, tenantCompanyId, {
      movement_type: "expense",
      ledger_type: "cash",
      source: "manual",
      concept: obligation.title,
      category: obligation.obligationType,
      amount: finalAmount,
      currency_code: obligation.currencyCode,
      movement_date: todayYmdUtc(),
      account_id: obligation.expectedAccountId,
      affects_cashflow: true,
      notes: `Egreso por pago programado: ${obligation.title}`,
      metadata: { planned_obligation_id: trimmedId },
    });
    if (!movement.ok) return movement;

    const linked = await plannedCashObligationRepositoryUpdate(
      supabase,
      workspaceId,
      trimmedId,
      { related_manual_movement_id: movement.data.id }
    );
    if (linked.error) return mapDbError(linked.error);
    if (linked.row) obligation = linked.row;
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const message = body?.register_cash_movement
    ? "Pago marcado como pagado y registrado en caja manual."
    : result.message;
  return protoCrudResult.ok(
    mapPlannedObligationToScheduledPayment(obligation, asOf),
    message
  );
}

export async function cancelScheduledPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string,
  body?: ScheduledPaymentCancelBody
): Promise<ProtoCrudResult<TreasuryScheduledPayment>> {
  const result = await plannedCashObligationCancel(
    supabase,
    tenantCompanyId,
    id,
    body?.notes
  );
  if (!result.ok) return result;
  const asOf = new Date().toISOString().slice(0, 10);
  return protoCrudResult.ok(
    mapPlannedObligationToScheduledPayment(result.data, asOf),
    result.message
  );
}

/**
 * Elimina un pago programado (borrado físico). Cancelar conserva el registro como `cancelled`.
 */
export async function deleteScheduledPayment(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  id: string
): Promise<ProtoCrudResult<{ id: string }>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const trimmedId = id?.trim();
  if (!trimmedId) {
    return protoCrudResult.fail("VALIDATION", "Falta el id del pago.");
  }

  const existing = await plannedCashObligationRepositoryGetById(
    supabase,
    workspaceId,
    trimmedId
  );
  if (existing.error) return mapDbError(existing.error);
  if (!existing.row) {
    return protoCrudResult.fail("NOT_FOUND", "Pago futuro no encontrado.");
  }

  const { deleted, error } = await plannedCashObligationRepositoryDelete(
    supabase,
    workspaceId,
    trimmedId
  );
  if (error) return mapDbError(error);
  if (!deleted) {
    return protoCrudResult.fail("NOT_FOUND", "Pago futuro no encontrado.");
  }

  return protoCrudResult.ok({ id: trimmedId }, "Pago futuro eliminado.");
}
