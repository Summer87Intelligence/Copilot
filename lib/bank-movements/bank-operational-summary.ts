/**
 * FASE BANK-FILTERS-KPI-AND-HISTORY-USABILITY-001
 *
 * Resumen operativo canónico para las 4 tarjetas KPI.
 * Contrato documentado:
 * - Período / dirección / cuenta afectan KPI.
 * - Búsqueda textual NO afecta KPI.
 * - Filtro de estado de lista NO afecta las tarjetas (resumen del período).
 * - Duplicados y ocultos quedan fuera del universo operativo.
 *
 * Revisados = recibieron una decisión:
 * asociación activa, matched, ignored (no comercial), o needs_review (pendiente).
 */
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import { isBankMovementHistorical } from "@/lib/bank/canonical/historical-policy";
import { isBankMovementUiHidden } from "@/lib/bank-movements/bank-movement-visibility";
import { movementDateInInclusiveRange } from "@/lib/bank-movements/bank-period";
import { deriveSimpleMovementState } from "@/lib/bank-movements/simple-movement-association";
import type { MovementReconciliationLevel } from "@/lib/bank/canonical/movement-reconciliation-level-labels";

export type BankOperationalSummaryInput = {
  movements: BankMovement[];
  from: string;
  to: string;
  duplicates?: Record<string, { canonicalMovementId: string }>;
  levels?: Record<string, MovementReconciliationLevel>;
  /** Filtros que SÍ afectan KPI (además del período). */
  direction?: "all" | "inflow" | "outflow";
  currency?: "all" | "UYU" | "USD";
};

export type BankOperationalSummary = {
  pendingIdentificationCount: number;
  inflowCount: number;
  outflowCount: number;
  reviewedCount: number;
  totalOperationalCount: number;
  inflowAmountByCurrency: { UYU: number; USD: number };
  outflowAmountByCurrency: { UYU: number; USD: number };
  periodLabel?: string;
};

function isDuplicate(
  movementId: string,
  duplicates: Record<string, { canonicalMovementId: string }> | undefined
): boolean {
  return Boolean(duplicates?.[movementId]);
}

function hasActiveAssociation(
  movement: BankMovement,
  levels: Record<string, MovementReconciliationLevel> | undefined
): boolean {
  const level = levels?.[movement.id];
  const simple = deriveSimpleMovementState({
    direction: movement.direction,
    status: movement.status,
    isDuplicate: false,
    isHidden: false,
    level,
  });
  return simple === "asociado";
}

/** True si el movimiento ya recibió una decisión operativa. */
export function isBankMovementReviewed(
  movement: BankMovement,
  levels?: Record<string, MovementReconciliationLevel>
): boolean {
  if (movement.status === "matched" || movement.status === "ignored") return true;
  if (movement.status === "needs_review") return true;
  return hasActiveAssociation(movement, levels);
}

export function getBankOperationalSummary(
  input: BankOperationalSummaryInput
): BankOperationalSummary {
  const duplicates = input.duplicates ?? {};
  const levels = input.levels ?? {};
  const direction = input.direction ?? "all";
  const currency = input.currency ?? "all";

  const universe = input.movements.filter((m) => {
    if (isBankMovementHistorical(m)) return false;
    if (isDuplicate(m.id, duplicates)) return false;
    if (isBankMovementUiHidden(m.metadata)) return false;
    if (!movementDateInInclusiveRange(m.movement_date, input.from, input.to)) return false;
    if (direction !== "all" && m.direction !== direction) return false;
    if (currency !== "all" && m.currency !== currency) return false;
    return true;
  });

  let pendingIdentificationCount = 0;
  let inflowCount = 0;
  let outflowCount = 0;
  let reviewedCount = 0;
  const inflowAmountByCurrency = { UYU: 0, USD: 0 };
  const outflowAmountByCurrency = { UYU: 0, USD: 0 };

  for (const m of universe) {
    if (m.direction === "inflow") {
      inflowCount += 1;
      if (m.currency === "UYU" || m.currency === "USD") {
        inflowAmountByCurrency[m.currency] += Number(m.amount) || 0;
      }
    } else if (m.direction === "outflow") {
      outflowCount += 1;
      if (m.currency === "UYU" || m.currency === "USD") {
        outflowAmountByCurrency[m.currency] += Number(m.amount) || 0;
      }
    }

    if (isBankMovementReviewed(m, levels)) {
      reviewedCount += 1;
    }

    // Pendientes: ingresos operativos sin asociación y no no-comercial
    if (m.direction === "inflow" && m.status !== "ignored") {
      const simple = deriveSimpleMovementState({
        direction: m.direction,
        status: m.status,
        isDuplicate: false,
        isHidden: false,
        level: levels[m.id],
      });
      if (simple === "sin_cliente" || simple === "pendiente") {
        // Solo "sin cliente" cuenta como pendiente de identificar;
        // "pendiente" (needs_review) ya es una decisión → no suma a pendientes.
        if (simple === "sin_cliente") pendingIdentificationCount += 1;
      }
    }
  }

  return {
    pendingIdentificationCount,
    inflowCount,
    outflowCount,
    reviewedCount,
    totalOperationalCount: universe.length,
    inflowAmountByCurrency,
    outflowAmountByCurrency,
  };
}
