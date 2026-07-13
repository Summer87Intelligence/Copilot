/**
 * FIX-HOY-RECURRING-PAYMENTS-PROJECTION-001 — helpers puros.
 *
 * Convierte drafts de próximas ocurrencias recurrentes (ya calculados con
 * `generateUpcomingObligations`, ya dedupeados server-side contra
 * `planned_cash_obligations` por `recurring_instance_key`) en filas
 * `TreasuryScheduledPayment` de solo lectura para Hoy, y las mezcla con los
 * pagos programados materializados sin duplicar.
 *
 * Sin I/O, sin Supabase — solo transformación de datos ya cargados.
 */

import type { GeneratedObligationDraft } from "@/lib/treasury/treasury-recurring-obligations";
import {
  obligationTypeToScheduledCategory,
  type TreasuryScheduledPayment,
} from "@/lib/treasury/treasury-scheduled-payments";

const DAY_MS = 86_400_000;

/**
 * Horizonte de `items` para Hoy: hoy + 90 días. Cubre los tres buckets del
 * calendario ejecutivo (Este mes / Próximo mes / Más adelante hasta +90d,
 * ver `lib/hoy-calendar-period.ts`) y sobra para los ~5 viernes de la
 * proyección semanal. Independiente del horizonte "fin de mes actual" que
 * sigue usando la card "Caja proyectada a fin de mes".
 */
export function hoyItemsHorizonEndDate(todayYmd: string): string {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setTime(dt.getTime() + 90 * DAY_MS);
  return dt.toISOString().slice(0, 10);
}

/**
 * Drafts de recurrentes (solo egresos — "pagos recurrentes") → filas
 * `TreasuryScheduledPayment` proyectadas. Siempre `status: "scheduled"`
 * (nunca "paid"/"cancelled") y `isProjected: true` para que la UI las
 * distinga de pagos ya materializados sin mostrarlas como pagadas.
 */
export function mapRecurringDraftsToProjectedPayments(
  drafts: readonly GeneratedObligationDraft[]
): TreasuryScheduledPayment[] {
  return drafts
    .filter((draft) => draft.input.direction !== "inflow")
    .map((draft) => {
      const recurringCategoryLabel =
        typeof draft.input.metadata?.recurring_category === "string"
          ? draft.input.metadata.recurring_category
          : null;
      return {
        id: `recurring-projection:${draft.recurringInstanceKey}`,
        workspaceId: "",
        name: draft.input.title,
        category: obligationTypeToScheduledCategory(draft.input.obligationType),
        obligationType: draft.input.obligationType,
        currency: draft.input.currencyCode,
        amount: draft.input.amountEstimated,
        dueDate: draft.dueDate,
        status: "scheduled",
        recurrence: "none",
        source: "recurring_rule",
        notes: null,
        paidAt: null,
        createdAt: draft.dueDate,
        updatedAt: draft.dueDate,
        recurringCategoryLabel,
        isProjected: true,
      };
    });
}

/**
 * Mezcla pagos materializados con proyecciones de recurrentes sin duplicar.
 * El dedupe fuerte (por `recurring_instance_key`) ya ocurre server-side en
 * `recurringObligationPreviewUpcoming`; esto es una red de seguridad por id.
 */
export function mergeScheduledPaymentsWithProjections(
  materialized: readonly TreasuryScheduledPayment[],
  projected: readonly TreasuryScheduledPayment[]
): TreasuryScheduledPayment[] {
  const materializedIds = new Set(materialized.map((p) => p.id));
  const extra = projected.filter((p) => !materializedIds.has(p.id));
  return [...materialized, ...extra];
}
