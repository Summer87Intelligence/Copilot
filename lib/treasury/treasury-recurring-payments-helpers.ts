/**
 * Helpers puros para el panel de recurrentes.
 * Sin efectos secundarios, sin fetch, sin I/O.
 */

import { resolveRecurringTemplateId } from "@/lib/treasury/treasury-scheduled-outflow-eligibility";
import type { TreasuryRecurringPayment } from "@/lib/treasury/treasury-recurring-payments";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";

export type RecurringTemplateAction =
  | "edit"
  | "pause"
  | "reactivate"
  | "view_payments"
  | "delete";

/** Acciones disponibles según estado del recurrente. */
export function getRecurringTemplateActions(
  row: Pick<TreasuryRecurringPayment, "active">
): RecurringTemplateAction[] {
  if (row.active) {
    return ["edit", "pause", "view_payments", "delete"];
  }
  return ["edit", "reactivate", "view_payments", "delete"];
}

/** Etiqueta de estado en español. */
export function getRecurringTemplateStatusLabel(
  row: Pick<TreasuryRecurringPayment, "active" | "autoGenerate">
): "Activo" | "Pausado" | "Eliminado" {
  if (isRecurringTemplateDeleted(row)) return "Eliminado";
  return row.active ? "Activo" : "Pausado";
}

/** Eliminado vía menú: desactivado y sin auto-generación (distinto de pausa). */
export function isRecurringTemplateDeleted(
  row: Pick<TreasuryRecurringPayment, "active" | "autoGenerate">
): boolean {
  return !row.active && row.autoGenerate === false;
}

/** Filas visibles en la tabla de recurrentes activos/pausados. */
export function filterVisibleRecurringTemplates(
  items: readonly TreasuryRecurringPayment[]
): TreasuryRecurringPayment[] {
  return items.filter((row) => !isRecurringTemplateDeleted(row));
}

/** Frecuencia legible: "Mensual día 20", "Semanal", "Anual", "Mensual". */
export function formatRecurrenceFrequency(
  row: Pick<TreasuryRecurringPayment, "recurrenceType" | "recurrenceInterval" | "metadata">
): string {
  const meta = row.metadata ?? {};
  const freq = typeof meta.frequency === "string" ? meta.frequency : null;
  const dayOfMonth = typeof meta.day_of_month === "number" ? meta.day_of_month : null;

  const isWeekly = freq === "weekly" || row.recurrenceInterval === 7;
  const isYearly = freq === "yearly" || row.recurrenceType === "yearly";

  if (isWeekly) return "Semanal";
  if (isYearly) return "Anual";
  if (dayOfMonth !== null) return `Mensual día ${dayOfMonth}`;
  return "Mensual";
}

/** Próximo vencimiento como "DD/MM/YYYY". Devuelve "—" si el template está pausado. */
export function formatNextOccurrenceDisplay(
  row: Pick<TreasuryRecurringPayment, "active" | "nextOccurrenceDate">
): string {
  if (!row.active) return "—";
  const date = row.nextOccurrenceDate;
  if (!date || date.length < 10) return "—";
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

/** Payload para pausar un recurrente. */
export function buildRecurringPausePayload(): { active: false } {
  return { active: false };
}

/** Payload para reactivar un recurrente. */
export function buildRecurringReactivatePayload(): { active: true } {
  return { active: true };
}

/** Filtra obligaciones generadas por un template recurrente. */
export function filterGeneratedPaymentsByTemplate(
  obligations: readonly PlannedCashObligation[],
  templateId: string
): PlannedCashObligation[] {
  if (!templateId) return [];
  return obligations.filter(
    (o) => resolveRecurringTemplateId(o) === templateId
  );
}

/** Etiqueta de estado de obligación en español. */
export function getObligationStatusLabel(
  status: PlannedCashObligation["status"]
): string {
  switch (status) {
    case "planned": return "Pendiente";
    case "confirmed": return "Confirmado";
    case "paid": return "Pagado";
    case "cancelled": return "Cancelado";
    case "overdue": return "Vencido";
    default: return status;
  }
}
