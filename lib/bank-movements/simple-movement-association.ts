import type { BankMovementStatus } from "@/lib/bank-movements/bank-movements-types";
import type { MovementReconciliationLevel } from "@/lib/bank/canonical/movement-reconciliation-level-labels";

/**
 * FASE BANK-SIMPLE-MOVEMENT-TO-CLIENT-RESET-001 — capa de simplificación
 * visual sobre el motor real de niveles de conciliación
 * (`MovementReconciliationLevel`). No reemplaza ese motor ni sus datos: solo
 * colapsa sus 8 niveles técnicos a los 7 estados simples que el usuario final
 * necesita ver. "asociado" cubre cualquier nivel donde ya existe una
 * identificación de cliente o un link financiero real (client_identified,
 * missing_receipt, reconciled_with_receipt, full_reconciliation,
 * third_party, shared_account, requires_review) — el detalle fino de recibo
 * y factura queda en el bloque secundario "Información adicional", nunca en
 * el estado principal.
 */
export const SIMPLE_MOVEMENT_STATES = [
  "sin_cliente",
  "asociado",
  "pendiente",
  "ingreso_no_comercial",
  "duplicado",
  "oculto",
] as const;

export type SimpleMovementState = (typeof SIMPLE_MOVEMENT_STATES)[number];

export const SIMPLE_MOVEMENT_STATE_LABEL: Record<SimpleMovementState, string> = {
  sin_cliente: "Sin cliente",
  asociado: "Asociado",
  pendiente: "Pendiente",
  ingreso_no_comercial: "Ingreso no comercial",
  duplicado: "Duplicado",
  oculto: "Oculto",
};

export const SIMPLE_MOVEMENT_STATE_ACTION_LABEL: Record<SimpleMovementState, string | null> = {
  sin_cliente: "Asignar cliente",
  asociado: "Ver asociación",
  pendiente: "Asignar cliente",
  ingreso_no_comercial: null,
  duplicado: "Ver evidencia",
  oculto: "Volver a mostrar",
};

export function deriveSimpleMovementState(input: {
  direction: "inflow" | "outflow";
  status: BankMovementStatus;
  isDuplicate: boolean;
  isHidden: boolean;
  level: MovementReconciliationLevel | null | undefined;
}): SimpleMovementState | null {
  if (input.isHidden) return "oculto";
  if (input.isDuplicate) return "duplicado";
  if (input.direction !== "inflow") return null;
  if (input.status === "ignored") return "ingreso_no_comercial";
  if (input.status === "needs_review") return "pendiente";
  if (!input.level || input.level === "unidentified") return "sin_cliente";
  return "asociado";
}
