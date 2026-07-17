/**
 * FASE E — Modelo de dominio PURO para conciliación bancaria N:M auditable.
 *
 * Complementa la conciliación inline de `bank_movements` (matched_type/matched_id)
 * con relaciones que registran el IMPORTE APLICADO por operación, permitiendo
 * aplicaciones parciales y múltiples. Reglas duras:
 *   - importe aplicado siempre positivo;
 *   - no sobre-aplicar (Σ aplicado ≤ importe del movimiento);
 *   - no conciliar cruzando monedas;
 *   - una conciliación VINCULA operaciones: nunca crea dinero nuevo.
 *
 * PURO: no toca DB. La persistencia (tabla `bank_movement_reconciliation_links`)
 * y las APIs se conectan aparte y deben degradar si la migración está pendiente.
 */

import type { BankMovementDirection } from "@/lib/bank-movements/bank-movements-types";

export type ReconciliationCurrency = "UYU" | "USD";

export type ReconciliationTargetType =
  | "receipt"
  | "planned_cash_obligation"
  | "treasury_income"
  | "treasury_expense"
  | "bank_movement"
  | "manual"
  | "ignored";

export type ReconciliationMethod = "manual" | "suggested_confirmed";

export type ReconciliationConfidence = "high" | "medium" | "low";

/** Estado canónico de conciliación de un movimiento. */
export type CanonicalReconciliationStatus =
  | "pending"
  | "partial"
  | "reconciled"
  | "ignored"
  | "duplicate";

export type ReconciliationLink = {
  id: string;
  bankMovementId: string;
  targetType: ReconciliationTargetType;
  targetId: string | null;
  appliedAmount: number;
  currency: ReconciliationCurrency;
  direction: BankMovementDirection;
  method: ReconciliationMethod;
  confidence: ReconciliationConfidence | null;
  archivedAt: string | null;
};

/** Tolerancia de centavos para considerar un movimiento totalmente aplicado. */
export const RECONCILIATION_FULL_TOLERANCE = 0.01;

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Relaciones activas (no archivadas) que no son 'ignored'. */
export function activeApplyingLinks(links: readonly ReconciliationLink[]): ReconciliationLink[] {
  return links.filter((l) => l.archivedAt == null && l.targetType !== "ignored");
}

/** Σ importe aplicado por movimiento (solo relaciones activas y aplicantes). */
export function sumAppliedByMovement(
  links: readonly ReconciliationLink[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of activeApplyingLinks(links)) {
    map.set(l.bankMovementId, r2((map.get(l.bankMovementId) ?? 0) + Math.max(0, l.appliedAmount)));
  }
  return map;
}

/**
 * Deriva el estado canónico de conciliación de UN movimiento a partir de sus
 * relaciones y el importe del movimiento.
 *   - alguna relación 'ignored' activa ⇒ 'ignored';
 *   - flags.duplicate ⇒ 'duplicate';
 *   - Σ aplicado ≈ importe ⇒ 'reconciled';
 *   - 0 < Σ aplicado < importe ⇒ 'partial';
 *   - Σ aplicado == 0 ⇒ 'pending'.
 */
export function deriveReconciliationStatus(
  movementAmount: number,
  links: readonly ReconciliationLink[],
  flags?: { duplicate?: boolean }
): CanonicalReconciliationStatus {
  const active = links.filter((l) => l.archivedAt == null);
  if (active.some((l) => l.targetType === "ignored")) return "ignored";
  if (flags?.duplicate) return "duplicate";

  const applied = r2(
    active
      .filter((l) => l.targetType !== "ignored")
      .reduce((s, l) => s + Math.max(0, l.appliedAmount), 0)
  );
  const amount = r2(Math.abs(movementAmount));
  if (applied <= 0) return "pending";
  if (applied >= amount - RECONCILIATION_FULL_TOLERANCE) return "reconciled";
  return "partial";
}

export type ReconciliationApplicationInput = {
  movementAmount: number;
  movementCurrency: string | null;
  movementDirection: BankMovementDirection;
  /** Σ ya aplicado por relaciones activas previas. */
  alreadyApplied: number;
  newApplied: number;
  targetCurrency: string;
  targetDirection?: BankMovementDirection;
};

export type ReconciliationApplicationResult =
  | { ok: true; remainingAfter: number }
  | { ok: false; code: "INVALID_AMOUNT" | "CROSS_CURRENCY" | "CROSS_DIRECTION" | "OVER_APPLIED"; message: string };

/**
 * Valida aplicar `newApplied` a un movimiento. Bloquea importes no positivos,
 * cruce de monedas, cruce de dirección y sobre-aplicación.
 */
export function validateReconciliationApplication(
  input: ReconciliationApplicationInput
): ReconciliationApplicationResult {
  const newApplied = r2(input.newApplied);
  if (!(newApplied > 0)) {
    return { ok: false, code: "INVALID_AMOUNT", message: "El importe aplicado debe ser mayor a 0." };
  }
  const movCur = String(input.movementCurrency ?? "").toUpperCase().trim();
  const tgtCur = String(input.targetCurrency ?? "").toUpperCase().trim();
  if (!movCur || movCur !== tgtCur) {
    return { ok: false, code: "CROSS_CURRENCY", message: "No se puede conciliar cruzando monedas." };
  }
  if (input.targetDirection && input.targetDirection !== input.movementDirection) {
    return { ok: false, code: "CROSS_DIRECTION", message: "La dirección de la operación no coincide con el movimiento." };
  }
  const amount = r2(Math.abs(input.movementAmount));
  const already = r2(Math.max(0, input.alreadyApplied));
  const total = r2(already + newApplied);
  if (total > amount + RECONCILIATION_FULL_TOLERANCE) {
    return {
      ok: false,
      code: "OVER_APPLIED",
      message: `No se puede aplicar más que el importe disponible (${r2(amount - already)}).`,
    };
  }
  return { ok: true, remainingAfter: r2(Math.max(0, amount - total)) };
}

/** Importe disponible aún no aplicado de un movimiento. */
export function remainingToApply(
  movementAmount: number,
  links: readonly ReconciliationLink[]
): number {
  const applied = r2(
    activeApplyingLinks(links).reduce((s, l) => s + Math.max(0, l.appliedAmount), 0)
  );
  return r2(Math.max(0, Math.abs(movementAmount) - applied));
}

/**
 * IDENTIDAD ANTI-DOBLE-CONTEO: conciliar NO crea dinero nuevo.
 * El "dinero nuevo" aportado por las conciliaciones de un movimiento es SIEMPRE 0:
 * una relación vincula el movimiento con una operación ya contabilizada (recibo,
 * ingreso de Tesorería, etc.), no genera un ingreso adicional.
 */
export function netNewMoneyFromReconciliation(
  _links: readonly ReconciliationLink[]
): number {
  return 0;
}
