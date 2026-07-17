import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { RECONCILIATION_DATE_WINDOW_DAYS } from "@/lib/bank-movements/bank-movement-reconciliation";
import {
  listReconciliationLinksByMovement,
} from "@/lib/bank-movements/bank-reconciliation-links-repository";
import { remainingToApply } from "@/lib/bank-movements/bank-reconciliation-links";
import {
  buildCandidateSuggestionsForMovement,
  type ReconciliationCandidate,
  type ReconciliationLinkSuggestion,
} from "@/lib/bank-movements/bank-reconciliation-suggestions";
import { toSafeNumber } from "@/lib/copilot-numeric-parse";
import { plannedCashObligationRepositoryList } from "@/lib/treasury/repositories/planned-cash-obligation-repository";

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd.slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

type MovementForSuggestions = {
  id: string;
  movement_date: string;
  description: string;
  amount: number;
  currency: string;
  direction: "inflow" | "outflow";
  metadata: Record<string, unknown> | null;
};

const OPEN_OBLIGATION_STATUSES = new Set(["planned", "confirmed", "overdue", "paid"]);

/**
 * Arma sugerencias determinísticas multi-entidad para UN movimiento.
 * Fuentes reales del tenant: obligaciones programadas (misma dirección) y, para
 * ingresos, recibos Zeta. NUNCA aplica cambios (requiere confirmación humana) y
 * excluye targets ya vinculados activos. Degrada si la tabla de links falta.
 */
export async function loadReconciliationSuggestionsForMovement(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  movementId: string;
}): Promise<
  | { ok: false; code: "MOVEMENT_NOT_FOUND" }
  | { ok: true; remaining: number; migrationPending: boolean; suggestions: ReconciliationLinkSuggestion[] }
> {
  const { supabase, workspaceId, movementId } = params;

  const { data: movementRow, error } = await supabase
    .from("bank_movements")
    .select("id, movement_date, description, amount, currency, direction, metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .maybeSingle();
  if (error || !movementRow) return { ok: false, code: "MOVEMENT_NOT_FOUND" };

  const movement: MovementForSuggestions = {
    id: String(movementRow.id),
    movement_date: String(movementRow.movement_date).slice(0, 10),
    description: String(movementRow.description ?? ""),
    amount: toSafeNumber(movementRow.amount) ?? 0,
    currency: String(movementRow.currency ?? ""),
    direction: movementRow.direction === "outflow" ? "outflow" : "inflow",
    metadata: (movementRow.metadata as Record<string, unknown> | null) ?? null,
  };

  const { links, migrationPending } = await listReconciliationLinksByMovement(
    supabase,
    workspaceId,
    movementId
  );
  const remaining = remainingToApply(movement.amount, links);
  const linkedTargetIds = new Set(
    links.filter((l) => l.archivedAt == null && l.targetId != null).map((l) => `${l.targetType}:${l.targetId}`)
  );

  if (!(remaining > 0)) {
    return { ok: true, remaining, migrationPending, suggestions: [] };
  }

  const fromDate = addDaysYmd(movement.movement_date, -RECONCILIATION_DATE_WINDOW_DAYS);
  const toDate = addDaysYmd(movement.movement_date, RECONCILIATION_DATE_WINDOW_DAYS);
  const currency = movement.currency === "USD" ? "USD" : "UYU";

  const candidates: ReconciliationCandidate[] = [];

  // Obligaciones programadas de la misma dirección (fuente ya usada por el motor inline).
  const { rows: obligations } = await plannedCashObligationRepositoryList(
    supabase,
    workspaceId,
    { direction: movement.direction, fromDate, toDate, currencyCode: currency },
    500
  );
  for (const o of obligations) {
    if (!OPEN_OBLIGATION_STATUSES.has(o.status)) continue;
    candidates.push({
      targetType: "planned_cash_obligation",
      targetId: o.id,
      title: o.title,
      description: o.description,
      reference: o.notes,
      amount: o.amountFinal ?? o.amountEstimated,
      currency: o.currencyCode,
      date: o.dueDate.slice(0, 10),
      direction: o.direction === "outflow" ? "outflow" : "inflow",
    });
  }

  // Recibos Zeta (cobros) solo para movimientos de ingreso.
  if (movement.direction === "inflow") {
    const qb = supabase
      .from("proto_receipts")
      .select("id, currency_code, amount, receipt_date, status, receipt_number, reference")
      .eq("workspace_company_id", workspaceId)
      .eq("is_active", true)
      .eq("currency_code", currency)
      .gte("receipt_date", fromDate)
      .lte("receipt_date", toDate)
      .limit(500);
    const { data: receiptRows } = await qb;
    for (const r of (receiptRows ?? []) as Record<string, unknown>[]) {
      const status = String(r.status ?? "").toLowerCase();
      if (["void", "voided", "canceled", "cancelled", "anulada"].some((x) => status.includes(x))) continue;
      candidates.push({
        targetType: "receipt",
        targetId: String(r.id),
        title: r.receipt_number != null ? `Recibo ${String(r.receipt_number)}` : "Recibo",
        description: r.reference != null ? String(r.reference) : null,
        reference: r.reference != null ? String(r.reference) : null,
        amount: toSafeNumber(r.amount) ?? 0,
        currency,
        date: r.receipt_date != null ? String(r.receipt_date).slice(0, 10) : movement.movement_date,
        direction: "inflow",
      });
    }
  }

  const available = candidates.filter((c) => !linkedTargetIds.has(`${c.targetType}:${c.targetId}`));
  const suggestions = buildCandidateSuggestionsForMovement(movement, available, remaining);

  return { ok: true, remaining, migrationPending, suggestions };
}
