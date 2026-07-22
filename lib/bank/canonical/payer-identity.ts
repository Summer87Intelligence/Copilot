import { createHash } from "node:crypto";

/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001, sección 7 — helpers puros
 * para la memoria de pagadores (`bank_payer_identities` / `client_payer_links`,
 * ya existentes en producción, ambas vacías hoy — sin escritor todavía).
 *
 * Separación explícita del enunciado: una `operation_reference` (LR/TR/TT/LE +
 * dígitos) identifica UNA transferencia puntual; una `payer_identity` identifica
 * el NOMBRE/CUENTA/PATRÓN que suele pagar, a través de múltiples operaciones.
 * Nunca se deriva una identidad de una referencia de operación puntual.
 */

/** Normaliza un nombre bancario para comparación estable (mayúsculas, sin acentos, espacios colapsados). */
export function normalizePayerName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

/** Token estable derivado del nombre normalizado (uso interno, nunca mostrado al usuario). */
export function buildPayerToken(normalizedName: string | null): string | null {
  if (!normalizedName) return null;
  const token = normalizedName.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return token || null;
}

/**
 * Enmascara una cuenta/token de origen para mostrar en UI sin exponer el dato
 * completo (sección "No mostrar cuentas completas ni hashes" de la adenda).
 * Conserva solo los últimos 4 caracteres visibles.
 */
export function maskAccountOrReference(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return `${"•".repeat(Math.max(trimmed.length - 4, 3))}${trimmed.slice(-4)}`;
}

/**
 * Hash estable (no reversible) de la cuenta/token/nombre de origen — es lo que
 * distingue identidades reales entre sí sin persistir el dato sensible en
 * claro más de lo necesario para el `masked_account` ya enmascarado.
 */
export function hashAccountOrReference(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type PayerFingerprintStrength = "document" | "account" | "bank_account_ref" | "reference" | "name" | "none";

/**
 * Determina la fuerza de la huella de identidad disponible, priorizando en el
 * orden que pide la sección 8: documento > cuenta/token de origen > nombre
 * normalizado > (sin nada confiable). Nunca se usa la referencia de una
 * operación puntual (TT.../LR.../TR.../LE...) como huella de identidad —
 * eso identifica la transferencia, no a quién la envía.
 */
export function derivePayerFingerprintStrength(input: {
  documentId?: string | null;
  accountOrToken?: string | null;
  normalizedName?: string | null;
}): PayerFingerprintStrength {
  if (input.documentId) return "document";
  if (input.accountOrToken) return "account";
  if (input.normalizedName) return "name";
  return "none";
}

export type ClientPayerLinkStatus =
  | "detected"
  | "suggested"
  | "confirmed"
  | "learned"
  | "conflicted"
  | "inactive"
  | "rejected";

export type PayerIdentityDisplayStatus = "Habitual" | "Ocasional" | "Compartida" | "En conflicto" | "Revocada";

/**
 * Traduce el estado técnico de `client_payer_links.status` (+ conteos) al
 * lenguaje simple que pide la adenda para Cliente 360 — nunca se muestra
 * "conflicted"/"learned"/"detected" tal cual al usuario.
 */
export function derivePayerIdentityDisplayStatus(input: {
  status: ClientPayerLinkStatus;
  confirmations: number;
  linkedToOtherClients: boolean;
}): PayerIdentityDisplayStatus {
  if (input.status === "inactive" || input.status === "rejected") return "Revocada";
  if (input.status === "conflicted") return "En conflicto";
  if (input.linkedToOtherClients) return "Compartida";
  if (input.confirmations >= 2) return "Habitual";
  return "Ocasional";
}

/** Referencias de operación puntual — NUNCA son identidad permanente. */
const OPERATION_REFERENCE_RE = /^(?:TT|LR|TR|LE|NRR)\d+/i;

export function isOperationReference(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().replace(/\s+/g, "");
  return OPERATION_REFERENCE_RE.test(trimmed);
}

/**
 * Marcadores de paginación que pdf-parse / extractores dejan en la descripción
 * (p. ej. "-- 4 of 6 --"). Nunca son pagador, identidad ni cluster.
 * Conserva la descripción raw en BD; solo se excluyen de la extracción.
 */
const PDF_PAGE_MARKER_RE =
  /(?:^|[\s/])(?:--\s*)?(?:\d+\s+of\s+\d+|page\s+\d+\s+of\s+\d+)(?:\s*--)?(?=$|[\s/])/gi;

/** Quita marcadores de página PDF sin alterar referencias bancarias válidas. */
export function stripPdfPageMarkers(text: string): string {
  return text.replace(PDF_PAGE_MARKER_RE, " ").replace(/\s+/g, " ").trim();
}

const PAYER_NAME_MARKER_PATTERNS: RegExp[] = [
  /RECIBIDA\s*\/\s*([^/]+)/i,
  /TRF\.\s*PLAZA-\s*\/\s*([^/]+)/i,
  /NRR:\d+\s+([^/]+)/i,
  // "CREDITO OPERACION EN BANCA DIGITAL T<código opcional>/<NOMBRE>" (Santander) —
  // el código previo a la barra (TBOTICA, TFACT 2968, T--, o nada) nunca es el
  // pagador; el nombre vive después de la primera barra.
  /CREDITO OPERACION EN BANCA DIGITAL\s*[^/]*\/\s*([^/]+)/i,
];

/**
 * Extrae el nombre del pagador desde la descripción bancaria (patrones Santander
 * observados). No usa bank_reference ni tokens TT/LR/TR/LE como identidad.
 * Los marcadores "-- N of M --" se descartan antes de formar el nombre.
 */
export function extractPayerNameFromDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const withoutMarkers = stripPdfPageMarkers(description);
  if (!withoutMarkers) return null;
  for (const re of PAYER_NAME_MARKER_PATTERNS) {
    const m = re.exec(withoutMarkers);
    if (!m?.[1]) continue;
    const cleaned = stripPdfPageMarkers(
      m[1]
        .replace(/\b(?:TT|LR|TR|LE)\d+\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (cleaned.length >= 3) return cleaned;
  }
  return null;
}

export type PayerLearningPayload = {
  accountHash: string;
  maskedAccount: string | null;
  normalizedName: string | null;
  originalName: string | null;
  bankName: string | null;
  fingerprintStrength: PayerFingerprintStrength;
  clientCompanyId: string | null;
};

/**
 * Deriva la payload de aprendizaje para `p_metadata.payer` desde señales del
 * movimiento. Prioridad: token/cuenta estable en metadata → nombre normalizado
 * estructurado → nombre parseado de descripción. Nunca usa reference/NRR/TT.
 * Devuelve null si no hay señal durable (confirmación puede seguir; sin hash
 * la RPC no escribe identidad).
 */
export function buildPayerLearningPayload(input: {
  description?: string | null;
  bankReference?: string | null;
  bankName?: string | null;
  metadata?: Record<string, unknown> | null;
  clientCompanyId?: string | null;
}): PayerLearningPayload | null {
  const meta = input.metadata ?? {};
  const metaNameRaw =
    typeof meta.payer_name_raw === "string" ? meta.payer_name_raw : null;
  const metaNameNorm =
    typeof meta.payer_name_normalized === "string" ? meta.payer_name_normalized : null;
  const metaToken =
    typeof meta.payer_token === "string" && meta.payer_token.trim()
      ? meta.payer_token.trim()
      : null;
  const metaAccountToken =
    typeof meta.payer_account_token === "string" && meta.payer_account_token.trim()
      ? meta.payer_account_token.trim()
      : null;

  const originalName =
    metaNameRaw ?? extractPayerNameFromDescription(input.description) ?? null;
  const normalizedName =
    normalizePayerName(metaNameNorm) ?? normalizePayerName(originalName);

  // Cuenta/token estable del CONTRAPARTE — nunca account_number de nuestra cuenta,
  // nunca bank_reference de la operación.
  let accountOrToken: string | null = null;
  if (metaAccountToken && !isOperationReference(metaAccountToken)) {
    accountOrToken = metaAccountToken;
  } else if (metaToken && !isOperationReference(metaToken)) {
    accountOrToken = metaToken;
  } else if (normalizedName) {
    accountOrToken = buildPayerToken(normalizedName);
  }

  if (!accountOrToken) return null;
  if (isOperationReference(input.bankReference) && accountOrToken === input.bankReference) {
    return null;
  }

  const strength = derivePayerFingerprintStrength({
    documentId: typeof meta.payer_document_id === "string" ? meta.payer_document_id : null,
    accountOrToken: metaAccountToken && !isOperationReference(metaAccountToken) ? metaAccountToken : null,
    normalizedName,
  });
  if (strength === "none") return null;

  return {
    accountHash: hashAccountOrReference(`v1|${accountOrToken}`),
    maskedAccount: maskAccountOrReference(accountOrToken),
    normalizedName,
    originalName,
    bankName: input.bankName ?? null,
    fingerprintStrength: strength,
    clientCompanyId: input.clientCompanyId ?? null,
  };
}
