/**
 * Normalización de texto bancario para reconocer pagadores.
 *
 * Objetivo: comparar el nombre bancario que llega en un movimiento (ej.
 * "TRANSFERENCIA RECIBIDA JP SOLUCIONES S.A.S.") contra alias de clientes
 * (ej. "JP SOLUCIONES SAS") sin ser demasiado agresivo. Módulo puro.
 */

/** Prefijos típicos de operaciones de crédito/transferencia a descartar. */
const PAYMENT_PREFIXES = [
  "transferencia recibida",
  "transferencia interbancaria",
  "transferencia entre cuentas",
  "transferencia",
  "transf",
  "deposito",
  "credito",
  "acreditacion",
  "abono",
  "pago",
  "cobro",
  "recibido",
  "giro",
];

/** Tokens genéricos que no aportan a la identidad del pagador. */
const GENERIC_TOKENS = new Set([
  "sa",
  "sas",
  "srl",
  "ltda",
  "banco",
  "santander",
  "cuenta",
  "digital",
  "banca",
  "operacion",
  "ref",
  "referencia",
  "por",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  // Palabras de operación bancaria (no identifican al pagador).
  "pago",
  "pagos",
  "cobro",
  "transferencia",
  "transf",
  "deposito",
  "credito",
  "acreditacion",
  "abono",
  "recibido",
  "recibida",
  "giro",
]);

/**
 * Normalización base: minúsculas, sin tildes, sin símbolos, espacios colapsados.
 * Conserva letras y dígitos (los dígitos sirven para RUT).
 */
export function normalizeBankText(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza un alias/nombre de empresa: colapsa siglas societarias con puntos
 * (S.A.S. → sas) y quita el sufijo societario final (SA/SAS/SRL/LTDA) para que
 * "JP SOLUCIONES S.A.S." y "JP SOLUCIONES SAS" queden iguales.
 */
export function normalizeAliasText(value: string | null | undefined): string {
  let s = normalizeBankText(value);
  if (!s) return "";
  // Colapsar secuencias de letras sueltas de siglas: "s a s" → "sas".
  s = s
    .replace(/\bs a s\b/g, "sas")
    .replace(/\bs r l\b/g, "srl")
    .replace(/\bs a\b/g, "sa");
  // Quitar sufijo societario al final (no en el medio, para no romper nombres).
  s = s.replace(/\s+(sas|sa|srl|ltda|sociedad anonima)$/g, "").trim();
  return s;
}

/** Tokens significativos (>=3 chars, no genéricos ni puramente numéricos cortos). */
function significantTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t) && !/^\d{1,3}$/.test(t));
}

/**
 * Extrae el posible nombre del pagador desde la descripción bancaria,
 * quitando prefijos de operación al inicio. No adivina: solo limpia.
 */
export function extractPossiblePayerName(description: string | null | undefined): string {
  let s = normalizeBankText(description);
  if (!s) return "";
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PAYMENT_PREFIXES) {
      if (s === prefix) {
        s = "";
        changed = true;
        break;
      }
      if (s.startsWith(prefix + " ")) {
        s = s.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }
  // Quitar montos sueltos al final (números).
  s = s.replace(/(\s+\d[\d.,]*)+$/g, "").trim();
  return s;
}

export type AliasMatchKind = "exact" | "partial" | "none";

export type AliasMatchResult = {
  kind: AliasMatchKind;
  /** Texto normalizado del alias que se comparó. */
  normalizedAlias: string;
  /** Tokens significativos compartidos. */
  sharedTokens: string[];
};

/**
 * Compara un alias contra la descripción bancaria. No demasiado agresivo:
 * - "exact": el alias completo aparece en la descripción, o todos sus tokens
 *   significativos están presentes.
 * - "partial": comparten al menos un token significativo fuerte (>=4 chars).
 * - "none": alias demasiado corto/ambiguo o sin coincidencia real.
 */
export function compareAliasToBankDescription(
  alias: string | null | undefined,
  description: string | null | undefined
): AliasMatchResult {
  const na = normalizeAliasText(alias);
  const aliasTokens = significantTokens(na);

  // Alias demasiado corto o sin tokens fuertes ⇒ no matchear (evita falsos).
  if (na.length < 4 || aliasTokens.length === 0) {
    return { kind: "none", normalizedAlias: na, sharedTokens: [] };
  }

  const nd = normalizeBankText(description);
  const payer = normalizeAliasText(extractPossiblePayerName(description));
  const descTokens = new Set([...significantTokens(nd), ...significantTokens(payer)]);
  const shared = aliasTokens.filter((t) => descTokens.has(t));

  const fullyContained =
    (na.length >= 5 && (nd.includes(na) || payer.includes(na))) ||
    (aliasTokens.length >= 1 && shared.length === aliasTokens.length);

  if (fullyContained && (aliasTokens.length >= 2 || aliasTokens[0]!.length >= 5)) {
    return { kind: "exact", normalizedAlias: na, sharedTokens: shared };
  }

  const hasStrongShared = shared.some((t) => t.length >= 4);
  if (shared.length >= 1 && hasStrongShared) {
    return { kind: "partial", normalizedAlias: na, sharedTokens: shared };
  }

  return { kind: "none", normalizedAlias: na, sharedTokens: [] };
}

/** Normaliza un RUT/documento: solo dígitos. */
export function normalizeRut(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/\D+/g, "");
}

/** ¿La descripción contiene el RUT (secuencia de dígitos suficientemente larga)? */
export function bankDescriptionContainsRut(
  description: string | null | undefined,
  rut: string | null | undefined
): boolean {
  const r = normalizeRut(rut);
  if (r.length < 8) return false; // RUT uruguayo tiene 12 dígitos; evitar cortos
  const digits = normalizeRut(description);
  return digits.includes(r);
}
