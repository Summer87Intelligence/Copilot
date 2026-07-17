/**
 * FASE BANK-SHADOW-MATCHED-POLICY-001 — Política única de elegibilidad shadow.
 *
 * Fuente de verdad ÚNICA para decidir si un movimiento bancario puede procesarse
 * por el runner shadow. Debe aplicarse de forma idéntica en TODOS los caminos:
 * movementId único, movementIds explícitos, selección automática/limitada y
 * futuros runners controlados.
 *
 * Por defecto (conservador) se EXCLUYE:
 *   - fuera del workspace              → WORKSPACE_MISMATCH
 *   - egreso (no inflow)               → NON_COMMERCIAL_DIRECTION
 *   - con link canónico activo         → MOVEMENT_HAS_ACTIVE_LINK
 *   - anterior al corte operativo      → MOVEMENT_BEFORE_CUTOFF
 *   - status ignored                   → MOVEMENT_IGNORED
 *   - status reversed                  → MOVEMENT_REVERSED
 *   - status matched                   → MOVEMENT_ALREADY_MATCHED
 *   - cualquier otro status no elegible→ MOVEMENT_STATUS_NOT_ELIGIBLE
 *
 * `matched` solo puede incluirse con `includeMatchedForAudit=true` y queda como
 * audit-only: NO persiste, NUNCA AUTO, warning MATCHED_MOVEMENT_AUDIT, no modifica nada.
 */

import { isBankMovementDateHistorical } from "@/lib/bank/canonical/historical-policy";

/** Estados conciliables/pendientes de revisión que el shadow puede procesar. */
export const SHADOW_ELIGIBLE_STATUSES = ["pending", "suggested", "needs_review"] as const;
export type ShadowEligibleStatus = (typeof SHADOW_ELIGIBLE_STATUSES)[number];

export function isShadowEligibleStatus(status: string): status is ShadowEligibleStatus {
  return (SHADOW_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

export type ShadowEligibilityMovement = {
  id: string;
  workspaceId: string;
  status: string;
  direction: string;
  movementDate: string | null;
};

export type ShadowEligibilityInput = {
  movement: ShadowEligibilityMovement;
  workspaceId: string;
  hasActiveCanonicalLink: boolean;
  /** Solo server-side. Default false. Habilita `matched` como audit-only (nunca persiste). */
  includeMatchedForAudit?: boolean;
};

export type ShadowEligibilityResult =
  | { eligible: true; auditOnly: false }
  | { eligible: true; auditOnly: true; auditReason: "MATCHED_MOVEMENT_AUDIT" }
  | { eligible: false; skipReason: ShadowSkipReason };

export type ShadowSkipReason =
  | "WORKSPACE_MISMATCH"
  | "NON_COMMERCIAL_DIRECTION"
  | "MOVEMENT_HAS_ACTIVE_LINK"
  | "MOVEMENT_BEFORE_CUTOFF"
  | "MOVEMENT_IGNORED"
  | "MOVEMENT_REVERSED"
  | "MOVEMENT_ALREADY_MATCHED"
  | "MOVEMENT_STATUS_NOT_ELIGIBLE";

/**
 * Decisión pura y determinística de elegibilidad shadow.
 * Las exclusiones financieras duras (workspace, egreso, link activo, corte,
 * ignored, reversed) tienen prioridad sobre el modo audit; `includeMatchedForAudit`
 * solo afecta al status `matched` cuando el resto ya pasó.
 */
export function isShadowEligibleMovement(
  input: ShadowEligibilityInput
): ShadowEligibilityResult {
  const { movement, workspaceId, hasActiveCanonicalLink } = input;
  const includeMatchedForAudit = input.includeMatchedForAudit === true;

  if (!movement.workspaceId || movement.workspaceId !== workspaceId) {
    return { eligible: false, skipReason: "WORKSPACE_MISMATCH" };
  }

  if (String(movement.direction).toLowerCase() !== "inflow") {
    return { eligible: false, skipReason: "NON_COMMERCIAL_DIRECTION" };
  }

  if (hasActiveCanonicalLink) {
    return { eligible: false, skipReason: "MOVEMENT_HAS_ACTIVE_LINK" };
  }

  if (isBankMovementDateHistorical(movement.movementDate)) {
    return { eligible: false, skipReason: "MOVEMENT_BEFORE_CUTOFF" };
  }

  const status = String(movement.status).toLowerCase();

  if (status === "ignored") {
    return { eligible: false, skipReason: "MOVEMENT_IGNORED" };
  }
  if (status === "reversed") {
    return { eligible: false, skipReason: "MOVEMENT_REVERSED" };
  }

  if (status === "matched") {
    if (includeMatchedForAudit) {
      return { eligible: true, auditOnly: true, auditReason: "MATCHED_MOVEMENT_AUDIT" };
    }
    return { eligible: false, skipReason: "MOVEMENT_ALREADY_MATCHED" };
  }

  if (isShadowEligibleStatus(status)) {
    return { eligible: true, auditOnly: false };
  }

  return { eligible: false, skipReason: "MOVEMENT_STATUS_NOT_ELIGIBLE" };
}
