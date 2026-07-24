/**
 * Privacidad de saldos para el alcance `inflow_readonly` (Camila y cualquier
 * otro usuario futuro con ese mismo access_level en `bank_movements`).
 *
 * Puede leer movimientos individuales (solo ingresos), pero nunca un saldo
 * de cuenta: ni el saldo corrido por movimiento (`metadata.balance`, "Saldo
 * posterior" en Conciliación) ni los saldos de extracto (`opening_balance`/
 * `closing_balance` en `bank_statement_imports`, ya inalcanzables porque
 * Historial está bloqueado por completo para este alcance).
 *
 * No toca `amount`, `direction` ni ningún otro campo persistido: solo
 * elimina claves de saldo del JSON de metadata antes de responder.
 */

import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

const BANK_MOVEMENT_BALANCE_METADATA_KEYS = ["balance"] as const;

/**
 * Genérico: opera sobre cualquier objeto con un `metadata` tipo bolsa (el
 * movimiento embebido en una `ReconciliationSuggestion`, por ejemplo, viaja
 * en runtime con `metadata` completo aunque su tipo declarado lo excluya).
 */
function stripBalanceFromMetadataBag<T extends { metadata?: Record<string, unknown> | null }>(
  obj: T
): T {
  const metadata = obj.metadata;
  if (!metadata || typeof metadata !== "object") return obj;
  const hasBalanceKey = BANK_MOVEMENT_BALANCE_METADATA_KEYS.some((key) => key in metadata);
  if (!hasBalanceKey) return obj;

  const sanitizedMetadata = { ...metadata };
  for (const key of BANK_MOVEMENT_BALANCE_METADATA_KEYS) {
    delete sanitizedMetadata[key];
  }
  return { ...obj, metadata: sanitizedMetadata };
}

export function stripBankMovementBalanceMetadata(movement: BankMovement): BankMovement {
  return stripBalanceFromMetadataBag(movement);
}

export function sanitizeBankMovementsForInflowReadonly(movements: BankMovement[]): BankMovement[] {
  return movements.map(stripBankMovementBalanceMetadata);
}

/**
 * Para el movimiento embebido en una sugerencia de conciliación: el tipo
 * declarado (`Pick<BankMovement, ...>`) no incluye `metadata`, pero el
 * builder real (`scoreBankMovementAgainstObligation`) lo propaga igual. Se
 * sanitiza igual que un `BankMovement` completo, vía el mismo helper.
 */
export function stripSuggestionMovementBalanceMetadata<
  T extends { metadata?: Record<string, unknown> | null },
>(movement: T): T {
  return stripBalanceFromMetadataBag(movement);
}
