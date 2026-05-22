/**
 * Elegibilidad de obligaciones planificadas para resúmenes de egresos (Hoy / scheduled-payments).
 * Excluye instancias cuyo template recurrente está pausado, cancelado o inactivo.
 */

import type { PlannedCashObligationTemplate } from "@/lib/treasury/treasury-recurring-obligations";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";

/** Resuelve el id de plantilla recurrente desde columna, metadata o instance key. */
export function resolveRecurringTemplateId(row: PlannedCashObligation): string | null {
  const direct = row.recurringTemplateId?.trim();
  if (direct) return direct;

  const meta = row.metadata;
  if (meta && typeof meta.recurring_template_id === "string") {
    const fromMeta = meta.recurring_template_id.trim();
    if (fromMeta) return fromMeta;
  }

  const key =
    row.recurringInstanceKey?.trim() ??
    (typeof meta?.recurring_instance_key === "string" ? meta.recurring_instance_key.trim() : "");
  if (key.includes(":")) {
    const tpl = key.split(":")[0]?.trim();
    if (tpl) return tpl;
  }

  return null;
}

export function buildInactiveRecurringTemplateIdSet(
  templates: readonly Pick<PlannedCashObligationTemplate, "id" | "active">[]
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const template of templates) {
    if (!template.active) ids.add(template.id);
  }
  return ids;
}

export function isRecurringTemplateInactiveForScheduledOutflow(
  row: PlannedCashObligation,
  inactiveRecurringTemplateIds: ReadonlySet<string>
): boolean {
  if (inactiveRecurringTemplateIds.size === 0) return false;
  const templateId = resolveRecurringTemplateId(row);
  if (!templateId) return false;
  return inactiveRecurringTemplateIds.has(templateId);
}

/** Si false, la obligación no debe contar en Pagos próximos / proyección Hoy. */
export function shouldIncludePlannedObligationInScheduledOutflow(
  row: PlannedCashObligation,
  inactiveRecurringTemplateIds: ReadonlySet<string> = new Set()
): boolean {
  return !isRecurringTemplateInactiveForScheduledOutflow(row, inactiveRecurringTemplateIds);
}

export function filterPlannedCashObligationsForScheduledOutflow(
  payments: readonly PlannedCashObligation[],
  inactiveRecurringTemplateIds: ReadonlySet<string> = new Set()
): PlannedCashObligation[] {
  if (inactiveRecurringTemplateIds.size === 0) return [...payments];
  return payments.filter((row) =>
    shouldIncludePlannedObligationInScheduledOutflow(row, inactiveRecurringTemplateIds)
  );
}
