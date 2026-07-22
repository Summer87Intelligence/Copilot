import { createHash } from "node:crypto";

/**
 * FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
 *
 * Identidad de OPERACIÓN bancaria, independiente del parser/archivo que la
 * haya importado. `buildMovementDedupeKey` (santander-bank-statement-import-
 * service.ts) incluye la descripción normalizada a propósito — permite que
 * dos movimientos con la misma referencia/monto pero descripción distinta se
 * traten como operaciones distintas — pero por eso mismo NO detecta el caso
 * real confirmado (Nirmex 2026-04-10, Harrison 2026-01-29, Samysol 2026-07-07):
 * la MISMA transferencia real importada dos veces desde un PDF y un Excel (o
 * dos PDFs), donde cada parser produce una descripción ligeramente distinta
 * (espaciado, marcador de página "-- N of M --", mayúsculas).
 *
 * Esta huella es deliberadamente más angosta: se basa solo en los campos que
 * la operación bancaria real comparte sin importar quién la parseó — cuenta,
 * moneda, fecha, referencia e importe — nunca en la descripción ni en el
 * nombre del archivo. Es un chequeo ADICIONAL al dedupe_key existente, no un
 * reemplazo: el dedupe_key exacto sigue vigente para todo lo demás.
 */
export type CanonicalOperationFingerprintInput = {
  workspaceId: string;
  accountNumber: string;
  bankReference: string | null | undefined;
  movementDate: string;
  amount: number;
  currency: string;
};

/** Misma referencia normalizada sin importar mayúsculas/espacios extra del parser. */
export function normalizeCanonicalBankReference(
  reference: string | null | undefined
): string | null {
  if (!reference) return null;
  const trimmed = reference.trim().toUpperCase().replace(/\s+/g, "");
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Devuelve null cuando no hay referencia bancaria: nunca fusionar operaciones
 * a ciegas solo por fecha+importe+moneda (lo exige explícitamente la fase).
 * Workspace-scoped: el mismo importe/fecha/referencia en dos workspaces
 * distintos nunca colisiona.
 */
export function computeCanonicalOperationFingerprint(
  input: CanonicalOperationFingerprintInput
): string | null {
  const reference = normalizeCanonicalBankReference(input.bankReference);
  if (!reference) return null;

  const payload = [
    input.workspaceId,
    input.accountNumber.trim(),
    input.currency.trim().toUpperCase(),
    input.movementDate.slice(0, 10),
    reference,
    input.amount.toFixed(2),
  ].join("|");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}
