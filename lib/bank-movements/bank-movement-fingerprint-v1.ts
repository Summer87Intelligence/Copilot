/**
 * FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001
 *
 * Identidad canónica versionada de un movimiento bancario.
 * PDF, Excel y CSV convergen aquí — un solo algoritmo, no tres.
 *
 * Prioridad:
 * 1. Referencia/número de operación estable (huella fuerte).
 * 2. Fingerprint compuesto (sin referencia) — incluye descripción normalizada
 *    y dirección; nunca solo fecha+importe (dos transferencias legítimas
 *    del mismo día deben poder coexistir).
 *
 * No forma parte de la identidad: nombre de archivo, fecha de subida, página,
 * fila Excel, parser, mayúsculas/espacios irrelevantes.
 */
import { createHash } from "node:crypto";

export const BANK_MOVEMENT_FINGERPRINT_VERSION = 1 as const;
export const BANK_MOVEMENT_FINGERPRINT_PREFIX = "bank_movement_fingerprint_v1";

export type BankMovementFingerprintStrength = "bank_reference" | "composite";

export type BankMovementFingerprintV1Input = {
  workspaceId: string;
  /** Número de cuenta estable (solo dígitos / label parseado). */
  accountNumber: string;
  bankName?: string;
  movementDate: string;
  /** Fecha valor opcional (si el extracto la trae). */
  valueDate?: string | null;
  currency: string;
  /** Importe absoluto (siempre ≥ 0). */
  amount: number;
  direction: "inflow" | "outflow" | string;
  bankReference?: string | null;
  description?: string | null;
  /** Saldo posterior, si el extracto lo trae. */
  balanceAfter?: number | null;
  /** ID propio del banco, si existe aparte de la referencia. */
  bankOwnId?: string | null;
};

export type BankMovementFingerprintV1 = {
  fingerprint: string;
  version: typeof BANK_MOVEMENT_FINGERPRINT_VERSION;
  strength: BankMovementFingerprintStrength;
  /** Payload legible antes del hash (tests / evidencia). */
  canonicalPayload: string;
};

/** Normaliza espacios, mayúsculas y tildes (NFD + strip marks). */
export function normalizeBankText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Descripción Santander: quita ruido de paginación/parser sin borrar
 * información de negocio (pagador, concepto, etc.).
 */
export function normalizeSantanderDescription(description: string | null | undefined): string {
  const base = normalizeBankText(description);
  if (!base) return "";
  return base
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .replace(/\bpagina\s+\d+\s*(de|\/)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Referencia bancaria: mayúsculas, solo alfanuméricos; null si vacía. */
export function normalizeBankReference(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const trimmed = reference.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeCurrencyCode(currency: string): string {
  return currency.trim().toUpperCase();
}

export function normalizeMovementDate(date: string): string {
  return date.trim().slice(0, 10);
}

export function normalizeAbsoluteAmount(amount: number): string {
  const n = Math.abs(Number(amount));
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export function normalizeDirection(direction: string): "inflow" | "outflow" {
  const d = direction.trim().toLowerCase();
  if (d === "outflow" || d === "debit" || d === "egreso") return "outflow";
  return "inflow";
}

function hashPayload(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Calcula fingerprint v1 determinista.
 * Con referencia bancaria → strength bank_reference (cross-parser seguro).
 * Sin referencia → strength composite (incluye descripción normalizada).
 */
export function computeBankMovementFingerprintV1(
  input: BankMovementFingerprintV1Input
): BankMovementFingerprintV1 {
  const workspaceId = input.workspaceId.trim();
  const accountNumber = input.accountNumber.trim();
  const currency = normalizeCurrencyCode(input.currency);
  const movementDate = normalizeMovementDate(input.movementDate);
  const amount = normalizeAbsoluteAmount(input.amount);
  const direction = normalizeDirection(input.direction);
  const bankName = (input.bankName ?? "Santander").trim();
  // valueDate / balanceAfter se guardan como procedencia en metadata, no en la
  // identidad: un PDF puede traer saldo y el Excel del mismo período no — si
  // entraran al hash, el mismo movimiento real parecería nuevo.
  const bankOwnId = input.bankOwnId?.trim() ?? "";
  const reference = normalizeBankReference(input.bankReference);

  if (reference) {
    const canonicalPayload = [
      BANK_MOVEMENT_FINGERPRINT_PREFIX,
      String(BANK_MOVEMENT_FINGERPRINT_VERSION),
      "ref",
      workspaceId,
      bankName,
      accountNumber,
      currency,
      movementDate,
      reference,
      bankOwnId,
      amount,
      direction,
    ].join("|");
    return {
      fingerprint: hashPayload(canonicalPayload),
      version: BANK_MOVEMENT_FINGERPRINT_VERSION,
      strength: "bank_reference",
      canonicalPayload,
    };
  }

  const description = normalizeSantanderDescription(input.description);
  const canonicalPayload = [
    BANK_MOVEMENT_FINGERPRINT_PREFIX,
    String(BANK_MOVEMENT_FINGERPRINT_VERSION),
    "composite",
    workspaceId,
    bankName,
    accountNumber,
    currency,
    movementDate,
    amount,
    direction,
    description,
    bankOwnId,
  ].join("|");

  return {
    fingerprint: hashPayload(canonicalPayload),
    version: BANK_MOVEMENT_FINGERPRINT_VERSION,
    strength: "composite",
    canonicalPayload,
  };
}
