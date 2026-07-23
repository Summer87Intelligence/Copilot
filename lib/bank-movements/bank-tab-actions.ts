/**
 * Acciones permitidas por tab (FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001).
 * Movimientos = consulta. Conciliación = asignación.
 */
import type { SimpleMovementState } from "@/lib/bank-movements/simple-movement-association";

export type BankMovementsConsultAction =
  | "ver_movimiento"
  | "ver_cliente"
  | "ver_evidencia"
  | "ir_a_conciliacion"
  | "ocultar"
  | "restaurar";

export type BankReconciliationAction =
  | "asignar_cliente"
  | "ver_asociacion"
  | "cambiar_cliente"
  | "revocar_asociacion"
  | "ver_ficha_cliente"
  | "ver_evidencia"
  | "ver_detalle"
  | "revertir_estado";

/** Acciones visibles en Banco → Movimientos (nunca asignación). */
export function movementsConsultActions(input: {
  state: SimpleMovementState | null;
  hasClient: boolean;
  canManageVisibility: boolean;
  isHidden: boolean;
}): BankMovementsConsultAction[] {
  const actions: BankMovementsConsultAction[] = ["ver_movimiento"];
  if (input.state === "duplicado") {
    actions.push("ver_evidencia");
  } else if (input.hasClient) {
    actions.push("ver_cliente");
  } else if (input.state === "sin_cliente" || input.state === "pendiente") {
    actions.push("ir_a_conciliacion");
  }
  if (input.canManageVisibility) {
    actions.push(input.isHidden ? "restaurar" : "ocultar");
  }
  return actions;
}

/** Acciones visibles en Banco → Conciliación. */
export function reconciliationActions(input: {
  state: SimpleMovementState | null;
  canWrite: boolean;
}): BankReconciliationAction[] {
  if (input.state === "duplicado") return ["ver_evidencia"];
  if (input.state === "oculto") return [];
  if (input.state === "ingreso_no_comercial") {
    return input.canWrite ? ["ver_detalle", "revertir_estado"] : ["ver_detalle"];
  }
  if (input.state === "asociado") {
    const base: BankReconciliationAction[] = ["ver_asociacion", "ver_ficha_cliente"];
    if (input.canWrite) base.push("cambiar_cliente", "revocar_asociacion");
    return base;
  }
  if (input.state === "sin_cliente" || input.state === "pendiente") {
    return input.canWrite ? ["asignar_cliente"] : [];
  }
  return [];
}

/** Contratos de texto prohibidos en la UI de Movimientos. */
export const MOVIMIENTOS_FORBIDDEN_ACTION_LABELS = [
  "Asignar cliente",
  "Confirmar asociación",
  "Cambiar cliente",
  "Revocar asociación",
  "Dejar pendiente",
  "Marcar ingreso no comercial",
  "Marcar no comercial",
] as const;
