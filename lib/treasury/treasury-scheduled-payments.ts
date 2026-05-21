/**
 * Pagos programados de tesorería — capa de dominio sobre `planned_cash_obligations`.
 * Sin conversión de moneda. Sin LLM.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ScheduledPaymentCancelBody,
  ScheduledPaymentCreateBody,
  ScheduledPaymentUpdateBody,
} from "@/lib/api/schemas/treasury-scheduled-payment-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  plannedCashObligationRepositoryDelete,
  plannedCashObligationRepositoryGetById,
} from "@/lib/treasury/repositories/planned-cash-obligation-repository";
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
  | "Otros";

export const SCHEDULED_PAYMENT_CATEGORIES: ScheduledPaymentCategory[] = [
  "DGI",
  "BPS",
  "Sueldos",
  "Proveedores",
  "Alquiler",
  "Préstamos",
  "Servicios",
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
};

export type TreasuryOutflowSummary = {
  currency: TreasuryCurrencyCode;
  totalScheduled: number;
  overdue: number;
  next7Days: number;
  next30Days: number;
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
};

const CATEGORY_TO_TYPE: Record<ScheduledPaymentCategory, PlannedObligationType> = {
  DGI: "dgi",
  BPS: "bps",
  Sueldos: "salary",
  Proveedores: "supplier",
  Alquiler: "rent",
  Préstamos: "loan",
  Servicios: "service",
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

export function mapPlannedObligationToScheduledPayment(
  row: PlannedCashObligation,
  asOfDate: string
): TreasuryScheduledPayment {
  const status = mapStatus(row, asOfDate);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.title,
    category: obligationTypeToScheduledCategory(row.obligationType),
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
    let next30Days = 0;
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

      if (!dueOnOrBefore(row.dueDate, horizonEnd)) continue;

      itemsCount += 1;
      totalScheduled += amt;
      next30Days += amt;

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
      next30Days: roundMoney(next30Days),
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
    UYU: summaries.find((s) => s.currency === "UYU")?.next30Days ?? 0,
    USD: summaries.find((s) => s.currency === "USD")?.next30Days ?? 0,
  };
}

export type CoverageStatus = "healthy" | "attention" | "critical";

export function projectedBalanceCoverage(
  pending: number,
  scheduledOutflows: number
): { projected: number; coverageStatus: CoverageStatus } {
  const projected = roundMoney(pending - scheduledOutflows);
  if (scheduledOutflows <= 0) {
    return { projected, coverageStatus: pending > 0 ? "healthy" : "healthy" };
  }
  if (projected < 0) return { projected, coverageStatus: "critical" };
  const ratio = pending > 0 ? projected / pending : 0;
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
  id: string
): Promise<ProtoCrudResult<TreasuryScheduledPayment>> {
  const result = await plannedCashObligationMarkPaid(
    supabase,
    tenantCompanyId,
    id,
    undefined,
    undefined
  );
  if (!result.ok) return result;
  const asOf = new Date().toISOString().slice(0, 10);
  return protoCrudResult.ok(
    mapPlannedObligationToScheduledPayment(result.data, asOf),
    result.message
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
