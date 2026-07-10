/**
 * BANK-ACCOUNT-SCOPE-EASY-ONLY-001 — Regla central de cuentas de banco.
 *
 * Banco solo debe importar y conservar movimientos de cuentas de la empresa EASY.
 * Las cuentas personales de Daniel quedan bloqueadas. En producción usamos
 * ALLOWLIST: si una cuenta no está explícitamente habilitada, NO se importa
 * (se marca como "no reconocida" y se pide revisión). Nunca denylist sola.
 *
 * Módulo puro (sin IO). Fuente de verdad para importadores, preview y limpieza.
 */

/** Cuentas EASY / empresa — únicas habilitadas para importar. */
export const ALLOWED_BUSINESS_ACCOUNT_NUMBERS = ["1211749", "5101107711"] as const;

/** Cuentas Daniel / personales — bloqueadas explícitamente (además del allowlist). */
export const BLOCKED_PERSONAL_ACCOUNT_NUMBERS = ["005205831977", "001205667098"] as const;

export type BankAccountScope = "business" | "blocked_personal" | "unknown";

/**
 * Normaliza un número de cuenta: deja solo dígitos (quita espacios, puntos,
 * guiones, texto del banco/moneda). Preserva ceros a la izquierda tal como
 * vienen (ej. "005205831977"). No recorta.
 */
export function normalizeBankAccountNumber(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/\D+/g, "");
}

/** Igual que normalize pero sin ceros iniciales, para comparar con/sin ceros. */
function stripLeadingZeros(digits: string): string {
  const trimmed = digits.replace(/^0+/, "");
  // Preservar "0" si el número fuese todo ceros (no debería ocurrir con cuentas).
  return trimmed.length > 0 ? trimmed : digits.length > 0 ? "0" : "";
}

/**
 * Dos números de cuenta representan la misma cuenta si coinciden sus dígitos,
 * comparando también la versión sin ceros iniciales. Así "000001211749" ==
 * "1211749" y "5205831977" == "005205831977".
 */
function sameAccount(a: string, b: string): boolean {
  const da = normalizeBankAccountNumber(a);
  const db = normalizeBankAccountNumber(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return stripLeadingZeros(da) === stripLeadingZeros(db);
}

export function isAllowedBusinessBankAccount(value: string | null | undefined): boolean {
  if (!value) return false;
  return ALLOWED_BUSINESS_ACCOUNT_NUMBERS.some((allowed) => sameAccount(value, allowed));
}

export function isBlockedPersonalBankAccount(value: string | null | undefined): boolean {
  if (!value) return false;
  return BLOCKED_PERSONAL_ACCOUNT_NUMBERS.some((blocked) => sameAccount(value, blocked));
}

/**
 * Clasifica una cuenta. La allowlist tiene prioridad: una cuenta habilitada es
 * "business"; una explícitamente bloqueada es "blocked_personal"; cualquier otra
 * (incluida vacía) es "unknown" y NO debe importarse silenciosamente.
 */
export function classifyBankAccount(value: string | null | undefined): BankAccountScope {
  if (isAllowedBusinessBankAccount(value)) return "business";
  if (isBlockedPersonalBankAccount(value)) return "blocked_personal";
  return "unknown";
}

/** Solo las cuentas de empresa son importables. */
export function isImportableBankAccount(value: string | null | undefined): boolean {
  return classifyBankAccount(value) === "business";
}

/** Copy no técnico para el preview/UI según la clasificación. */
export function bankAccountScopeReason(
  scope: BankAccountScope,
  accountNumber: string
): string {
  const acc = normalizeBankAccountNumber(accountNumber) || accountNumber || "desconocida";
  if (scope === "blocked_personal") {
    return `Cuenta personal bloqueada: ${acc}. No se importa para no mezclar datos personales con los de EASY.`;
  }
  if (scope === "unknown") {
    return `Cuenta no reconocida: ${acc}. No se importó para evitar mezclar datos personales o ajenos.`;
  }
  return "";
}
