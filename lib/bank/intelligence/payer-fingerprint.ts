/**
 * FASE DOMAIN-IA-BANK-001 — Huella PURA de pagador bancario y de movimiento.
 *
 * ⚠ CORRECCIÓN DE AUDITORÍA (evidencia real, tenant Summer87): `bank_reference`
 * es mayormente una REFERENCIA DE OPERACIÓN (674/942 distintas ≈ 71% únicas), NO
 * una identidad estable del pagador. Y `account_label` tiene solo 2 valores = las
 * cuentas EASY propias (destino), NO la cuenta ORIGEN del pagador. Por eso:
 *
 *  - `deriveMovementFingerprint` usa `bank_reference` + importe + fecha → dedup de
 *    MOVIMIENTOS (operación individual), no identidad de pagador.
 *  - `derivePayerFingerprint` (identidad ESTABLE) prioriza señales del ordenante:
 *      1. documento / RUT;
 *      2. cuenta ORIGEN del pagador (solo si el caller la provee — NUNCA account_label propio);
 *      3. nombre normalizado (ÚLTIMO recurso).
 *    NUNCA usa bank_reference como identidad de pagador.
 *
 * NUNCA construye la huella solo con el nombre como identidad "estable". Versionada.
 * No toca DB; no expone la cuenta completa (solo enmascarada + hash determinístico).
 */

import { createHash } from "node:crypto";

import { normalizePayerName, NAME_NORMALIZER_VERSION } from "@/lib/bank/intelligence/name-normalizer";

export const PAYER_FINGERPRINT_VERSION = 1;

export type PayerSignals = {
  bankName?: string | null;
  /**
   * Cuenta ORIGEN del pagador (dígitos) si el banco la expone. NUNCA pasar aquí la
   * cuenta propia/destino (`account_label`): colapsaría todos los pagadores.
   */
  accountRaw?: string | null;
  /** Documento / RUT del pagador si viene. */
  documentId?: string | null;
  /** Nombre visible en el movimiento (payer). */
  payerName?: string | null;
};

export type PayerFingerprint = {
  version: number;
  /** Nivel de la señal usada (mayor = más estable). `reference` ya NO aplica a pagador. */
  strength: "account" | "document" | "bank_account_ref" | "name" | "none";
  /** Hash determinístico estable (no revela la cuenta completa). */
  hash: string;
  /** Cuenta enmascarada para mostrar (•••• 4821). Null si no hay cuenta. */
  maskedAccount: string | null;
  /** Nombre normalizado (ayuda, no identidad). */
  normalizedName: string;
};

/** Huella de MOVIMIENTO (operación individual) para deduplicar reimportaciones. */
export type MovementFingerprint = { version: number; hash: string };

function digitsOnly(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function sha(parts: (string | number)[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

/** Enmascara una cuenta dejando los últimos 4 dígitos. */
export function maskAccount(accountRaw: string | null | undefined): string | null {
  const d = digitsOnly(accountRaw);
  if (d.length < 4) return null;
  return `•••• ${d.slice(-4)}`;
}

/**
 * Deriva la huella estable de un pagador a partir de las señales del movimiento.
 * NO usa el nombre como identidad salvo que no exista ninguna señal estable.
 */
export function derivePayerFingerprint(signals: PayerSignals): PayerFingerprint {
  const bank = normalizePayerName(signals.bankName) || "bank";
  const normalizedName = normalizePayerName(signals.payerName);
  const masked = maskAccount(signals.accountRaw);
  const accountDigits = digitsOnly(signals.accountRaw);
  const doc = digitsOnly(signals.documentId);

  // Prioridad de IDENTIDAD ESTABLE (bank_reference NO participa: es per-operación).
  if (doc.length >= 6) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "document", hash: sha([PAYER_FINGERPRINT_VERSION, "doc", doc]), maskedAccount: masked, normalizedName };
  }
  if (accountDigits.length >= 4) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "account", hash: sha([PAYER_FINGERPRINT_VERSION, "acct", bank, accountDigits]), maskedAccount: masked, normalizedName };
  }
  if (masked) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "bank_account_ref", hash: sha([PAYER_FINGERPRINT_VERSION, "bar", bank, masked]), maskedAccount: masked, normalizedName };
  }
  if (normalizedName) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "name", hash: sha([PAYER_FINGERPRINT_VERSION, "name", bank, normalizedName]), maskedAccount: null, normalizedName };
  }
  return { version: PAYER_FINGERPRINT_VERSION, strength: "none", hash: sha([PAYER_FINGERPRINT_VERSION, "none"]), maskedAccount: null, normalizedName: "" };
}

/**
 * Huella de MOVIMIENTO (operación individual), para detectar reimportaciones del
 * mismo movimiento. Usa la referencia de operación + importe + fecha. NO identifica
 * al pagador (ver corrección de auditoría arriba).
 */
export function deriveMovementFingerprint(input: {
  bankName?: string | null;
  bankReference?: string | null;
  amountMinor: number;
  dateYmd: string;
  currency?: string | null;
}): MovementFingerprint {
  const bank = normalizePayerName(input.bankName) || "bank";
  const ref = (input.bankReference ?? "").trim();
  return {
    version: PAYER_FINGERPRINT_VERSION,
    hash: sha([PAYER_FINGERPRINT_VERSION, "mov", bank, ref, input.amountMinor, input.dateYmd.slice(0, 10), (input.currency ?? "").toUpperCase()]),
  };
}

/** True si la huella se apoya en una señal estable (no solo nombre). */
export function isStableFingerprint(fp: PayerFingerprint): boolean {
  return fp.strength !== "name" && fp.strength !== "none";
}

export const NAME_NORMALIZER_VERSION_USED = NAME_NORMALIZER_VERSION;
