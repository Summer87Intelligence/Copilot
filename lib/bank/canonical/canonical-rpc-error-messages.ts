/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — traduce los códigos de error de
 * `confirm_bank_reconciliation_v1` / `reject_bank_suggestion_v1` (y las
 * validaciones propias de esta capa) a mensajes legibles en español. Nunca
 * mostrar el código crudo solo al usuario — siempre acompañado de una frase.
 */

export const CANONICAL_RPC_ERROR_MESSAGES: Record<string, string> = {
  // confirm_bank_reconciliation_v1
  NO_WORKSPACE: "No se pudo identificar el workspace de la sesión.",
  WORKSPACE_MISMATCH: "Este movimiento no pertenece a tu empresa.",
  INVALID_ACTOR: "Tu usuario no está habilitado para confirmar conciliaciones.",
  MOVEMENT_NOT_FOUND: "No encontramos el movimiento bancario.",
  NON_COMMERCIAL: "Este movimiento es un egreso, no se puede conciliar como cobro de cliente.",
  MOVEMENT_NOT_RECONCILABLE: "Este movimiento está ignorado y no admite conciliación.",
  RECEIPT_NOT_FOUND: "No encontramos el recibo propuesto.",
  CURRENCY_MISMATCH: "La moneda del recibo o la factura no coincide con la del movimiento.",
  INVALID_AMOUNT: "El importe a aplicar debe ser mayor a cero.",
  ALLOCATIONS_EXCEED_LINK: "La suma de las facturas seleccionadas supera el importe a conciliar.",
  IDEMPOTENCY_CONFLICT: "Ya existe una conciliación distinta para este movimiento y este recibo.",
  SUGGESTION_NOT_CONFIRMABLE: "Esta sugerencia ya no está disponible para confirmar.",
  OVER_APPLIED_MOVEMENT: "El importe supera lo disponible del movimiento.",
  OVER_APPLIED_RECEIPT: "El importe supera lo disponible del recibo.",
  INVALID_ALLOCATION: "Una de las facturas seleccionadas tiene un importe inválido.",
  INVOICE_NOT_FOUND: "No encontramos una de las facturas seleccionadas.",
  INVOICE_FULLY_PAID: "Una de las facturas seleccionadas ya está totalmente paga.",
  OVER_APPLIED_INVOICE: "El importe supera el saldo pendiente de una de las facturas.",

  // reject_bank_suggestion_v1
  SUGGESTION_NOT_FOUND: "No encontramos la sugerencia de conciliación.",
  REASON_INVALID: "El motivo del rechazo debe tener entre 3 y 500 caracteres.",
  SCOPE_NOT_ALLOWED: "Esta sugerencia no admite esta acción.",
  SUGGESTION_TERMINAL: "Esta sugerencia ya fue procesada y no admite más cambios.",
  CONCURRENT_UPDATE: "Alguien más ya actualizó esta sugerencia. Actualizá la página e intentá de nuevo.",

  // Validaciones propias de esta capa (evidencia mostrada vs. lo enviado)
  MOVEMENT_MISMATCH: "El movimiento no coincide con la sugerencia. Actualizá la página e intentá de nuevo.",
  RECEIPT_MISMATCH: "El recibo no coincide con la evidencia de la sugerencia.",
  INVOICE_NOT_IN_EVIDENCE: "Una de las facturas seleccionadas no forma parte de la evidencia mostrada.",

  // FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — selección manual revisada
  CLIENT_MISMATCH: "El cliente no coincide con la evidencia de la sugerencia.",
  CLIENT_NOT_FOUND: "No encontramos ese cliente en este workspace.",
  RECEIPT_CLIENT_MISMATCH: "Ese recibo pertenece a otro cliente, no al seleccionado.",
  MANUAL_REASON_REQUIRED: "Necesitamos un motivo para confirmar una selección manual distinta de la sugerida.",
};

const IDEMPOTENT_SUCCESS_STATUSES = new Set(["already_confirmed", "already_linked", "already_rejected"]);

export function isIdempotentSuccessStatus(status: string | undefined | null): boolean {
  return status != null && IDEMPOTENT_SUCCESS_STATUSES.has(status);
}

/** Extrae el código de excepción crudo de un error de Postgres/PostgREST. */
export function extractCanonicalRpcErrorCode(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "UNKNOWN";
  const raw = (error.message ?? "").trim();
  // PostgREST suele devolver el mensaje de RAISE EXCEPTION tal cual, a veces con contexto adicional.
  const firstLine = raw.split("\n")[0]?.trim() ?? raw;
  const match = /^([A-Z][A-Z0-9_]+)/.exec(firstLine);
  return match ? match[1]! : firstLine || "UNKNOWN";
}

export function canonicalRpcErrorMessage(code: string): string {
  return CANONICAL_RPC_ERROR_MESSAGES[code] ?? "No se pudo completar la acción. Intentá de nuevo.";
}
