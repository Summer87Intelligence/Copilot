/**
 * FASE DOMAIN-IA-BANK-001 — Huella PURA y estable de pagador bancario.
 *
 * Reconoce "el mismo pagador" priorizando señales estables por sobre el nombre:
 *   1. identificador bancario estable (bank_reference / operación);
 *   2. cuenta origen (account_label / dígitos de cuenta);
 *   3. documento / RUT;
 *   4. combinación banco + cuenta enmascarada + referencia estable;
 *   5. nombre normalizado (ÚLTIMO recurso).
 *
 * NUNCA construye la huella solo con el nombre. Versionada para poder evolucionar.
 * No toca DB; no expone la cuenta completa (solo enmascarada + hash determinístico).
 */

import { createHash } from "node:crypto";

import { normalizePayerName, NAME_NORMALIZER_VERSION } from "@/lib/bank/intelligence/name-normalizer";

export const PAYER_FINGERPRINT_VERSION = 1;

export type PayerSignals = {
  bankName?: string | null;
  /** Etiqueta / número de cuenta origen si el banco lo expone. */
  accountRaw?: string | null;
  /** Referencia bancaria estable (nro de operación). */
  bankReference?: string | null;
  /** Documento / RUT del pagador si viene. */
  documentId?: string | null;
  /** Nombre visible en el movimiento (payer). */
  payerName?: string | null;
};

export type PayerFingerprint = {
  version: number;
  /** Nivel de la señal usada (mayor = más estable). */
  strength: "reference" | "account" | "document" | "bank_account_ref" | "name" | "none";
  /** Hash determinístico estable (no revela la cuenta completa). */
  hash: string;
  /** Cuenta enmascarada para mostrar (•••• 4821). Null si no hay cuenta. */
  maskedAccount: string | null;
  /** Nombre normalizado (ayuda, no identidad). */
  normalizedName: string;
};

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
  const ref = (signals.bankReference ?? "").trim();
  const doc = digitsOnly(signals.documentId);

  if (ref) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "reference", hash: sha([PAYER_FINGERPRINT_VERSION, "ref", bank, ref]), maskedAccount: masked, normalizedName };
  }
  if (accountDigits.length >= 4) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "account", hash: sha([PAYER_FINGERPRINT_VERSION, "acct", bank, accountDigits]), maskedAccount: masked, normalizedName };
  }
  if (doc.length >= 6) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "document", hash: sha([PAYER_FINGERPRINT_VERSION, "doc", doc]), maskedAccount: masked, normalizedName };
  }
  // Combinación banco + cuenta enmascarada + referencia (aunque sean parciales).
  if (masked) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "bank_account_ref", hash: sha([PAYER_FINGERPRINT_VERSION, "bar", bank, masked, ref]), maskedAccount: masked, normalizedName };
  }
  if (normalizedName) {
    return { version: PAYER_FINGERPRINT_VERSION, strength: "name", hash: sha([PAYER_FINGERPRINT_VERSION, "name", bank, normalizedName]), maskedAccount: null, normalizedName };
  }
  return { version: PAYER_FINGERPRINT_VERSION, strength: "none", hash: sha([PAYER_FINGERPRINT_VERSION, "none"]), maskedAccount: null, normalizedName: "" };
}

/** True si la huella se apoya en una señal estable (no solo nombre). */
export function isStableFingerprint(fp: PayerFingerprint): boolean {
  return fp.strength !== "name" && fp.strength !== "none";
}

export const NAME_NORMALIZER_VERSION_USED = NAME_NORMALIZER_VERSION;
