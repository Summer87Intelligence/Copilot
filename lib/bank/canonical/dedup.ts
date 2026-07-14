/**
 * Deduplicación bancaria canónica (FASE-3).
 *
 * Fingerprint puro y determinista. NO se elimina ningún registro: solo se
 * clasifica el nivel de confianza de una posible coincidencia. `fecha + importe`
 * por sí solo NO es duplicado (dos movimientos legítimos pueden coincidir).
 */
import type { CanonicalBankMovement } from "@/lib/bank/canonical/types";

export type DuplicateConfidence = "exact" | "high" | "medium" | "none";

export interface BankMovementFingerprintInput {
  movementDate: string;
  currency: string;
  amount: number;
  direction: string;
  normalizedDescription: string;
  accountIdentity: string;
}

/** Normaliza texto: minúsculas, sin acentos, espacios colapsados, sin signos. */
export function normalizeDescription(value: string | null | undefined): string {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIdentity(value: string | null | undefined): string {
  return normalizeDescription(value);
}

/** Importe canónico a 2 decimales, en centavos, para comparación estable. */
function amountKey(amount: number): string {
  return Math.round(Math.abs(amount) * 100).toString();
}

/**
 * Fingerprint compuesto. Incluye dirección, cuenta y descripción normalizada,
 * no solo fecha+importe, para no colapsar movimientos legítimos distintos.
 */
export function buildBankMovementFingerprint(input: BankMovementFingerprintInput): string {
  return [
    input.movementDate.slice(0, 10),
    input.currency,
    input.direction,
    amountKey(input.amount),
    normalizeIdentity(input.accountIdentity),
    normalizeDescription(input.normalizedDescription),
  ].join("|");
}

export function fingerprintOf(movement: CanonicalBankMovement): string {
  return buildBankMovementFingerprint({
    movementDate: movement.movementDate,
    currency: movement.currency,
    amount: movement.amount,
    direction: movement.direction,
    normalizedDescription: movement.description ?? "",
    accountIdentity: movement.accountId ?? "",
  });
}

/**
 * Clasifica la confianza de que dos movimientos sean el mismo hecho.
 *   exact  → mismo fingerprint completo (fecha+moneda+dir+importe+cuenta+desc).
 *   high   → misma fecha+moneda+dir+importe y descripción normalizada igual (cuenta distinta/ausente).
 *   medium → misma fecha+moneda+dir+importe pero descripción distinta.
 *   none   → no coinciden en la clave mínima.
 */
export function classifyDuplicate(
  a: CanonicalBankMovement,
  b: CanonicalBankMovement
): DuplicateConfidence {
  const sameCore =
    a.movementDate.slice(0, 10) === b.movementDate.slice(0, 10) &&
    a.currency === b.currency &&
    a.direction === b.direction &&
    amountKey(a.amount) === amountKey(b.amount);

  if (!sameCore) return "none";
  if (fingerprintOf(a) === fingerprintOf(b)) return "exact";

  const descA = normalizeDescription(a.description);
  const descB = normalizeDescription(b.description);
  if (descA && descA === descB) return "high";

  return "medium";
}

export interface CrossSourceDuplicate {
  canonical: CanonicalBankMovement;
  legacy: CanonicalBankMovement;
  confidence: Exclude<DuplicateConfidence, "none">;
}

/**
 * Detecta posibles duplicados ENTRE fuentes (canónica vs legacy).
 * Nunca elimina; solo reporta pares con su confianza para diagnóstico/dedupe.
 */
export function detectCrossSourceDuplicates(
  movements: readonly CanonicalBankMovement[]
): CrossSourceDuplicate[] {
  const canonical = movements.filter((m) => m.source === "bank_movements");
  const legacy = movements.filter((m) => m.source === "bank_reconciliation_movements");
  const out: CrossSourceDuplicate[] = [];

  for (const l of legacy) {
    for (const c of canonical) {
      const confidence = classifyDuplicate(c, l);
      if (confidence !== "none") out.push({ canonical: c, legacy: l, confidence });
    }
  }
  return out;
}
