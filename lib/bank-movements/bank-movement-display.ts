/**
 * FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001
 *
 * Descripción visible canónica única para Movimientos, Conciliación, drawer,
 * Historial y Cliente 360. La normalización queda solo para fingerprint /
 * búsqueda / dedupe — nunca como texto primario de UI.
 */
import { maskAccountOrReference } from "@/lib/bank/canonical/mask-account-or-reference";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

const PAGE_MARKER_RE = /--\s*\d+\s+of\s+\d+\s*--/gi;
/** Secuencias numéricas largas típicas de cuenta/token — no el texto del pagador. */
const SENSITIVE_DIGIT_RUN_RE = /\b\d{8,}\b/g;

/** Quita marcadores de paginación del parser sin alterar el pagador/concepto. */
export function stripBankPageMarkers(text: string): string {
  return text.replace(PAGE_MARKER_RE, " ").replace(/\s+/g, " ").trim();
}

export type BankMovementDescriptionSource = {
  raw_description?: string | null;
  description?: string | null;
  normalized_description?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Texto visible prioritario:
 * 1. raw_description (texto importado)
 * 2. description original
 * 3. normalized_description / metadata.normalized_description (fallback)
 * Nunca cadena vacía.
 */
export function getBankMovementDisplayDescription(
  movement: BankMovementDescriptionSource
): string {
  const candidates = [
    movement.raw_description,
    typeof movement.metadata?.raw_description === "string"
      ? movement.metadata.raw_description
      : null,
    movement.description,
    movement.normalized_description,
    typeof movement.metadata?.normalized_description === "string"
      ? movement.metadata.normalized_description
      : null,
  ];

  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const cleaned = stripBankPageMarkers(raw);
    if (cleaned.length > 0) return cleaned;
  }
  return "Sin descripción";
}

/**
 * Misma descripción canónica que Movimientos/Conciliación, con enmascarado
 * selectivo solo de corridas numéricas ≥8 dígitos (cuentas/tokens).
 * No reescribe el nombre del pagador ni el concepto Santander.
 * Usado en Historial / evidencia de auditoría (`descriptionMasked` legacy).
 */
export function getBankMovementAuditDisplayDescription(
  movement: BankMovementDescriptionSource
): string {
  const full = getBankMovementDisplayDescription(movement);
  if (full === "Sin descripción") return full;
  return full.replace(SENSITIVE_DIGIT_RUN_RE, (digits) => maskAccountOrReference(digits) ?? digits);
}

/** View-model de paridad Movimientos ↔ Conciliación para un mismo id. */
export type BankMovementListParityView = {
  id: string;
  displayDescription: string;
  amount: number;
  currency: string;
  movementDate: string;
  bankReference: string | null;
  clientCompanyId: string | null;
  clientName: string | null;
  simpleState: string | null;
  isDuplicate: boolean;
  isHidden: boolean;
};

export function buildBankMovementListParityView(input: {
  movement: BankMovement;
  clientCompanyId?: string | null;
  clientName?: string | null;
  simpleState?: string | null;
  isDuplicate: boolean;
  isHidden: boolean;
}): BankMovementListParityView {
  const m = input.movement;
  return {
    id: m.id,
    displayDescription: getBankMovementDisplayDescription(m),
    amount: Number(m.amount),
    currency: m.currency,
    movementDate: m.movement_date.slice(0, 10),
    bankReference: m.bank_reference,
    clientCompanyId: input.clientCompanyId ?? null,
    clientName: input.clientName ?? null,
    simpleState: input.simpleState ?? null,
    isDuplicate: input.isDuplicate,
    isHidden: input.isHidden,
  };
}

export function assertBankMovementParityEqual(
  a: BankMovementListParityView,
  b: BankMovementListParityView
): string[] {
  const diffs: string[] = [];
  if (a.id !== b.id) diffs.push("id");
  if (a.displayDescription !== b.displayDescription) diffs.push("displayDescription");
  if (a.amount !== b.amount) diffs.push("amount");
  if (a.currency !== b.currency) diffs.push("currency");
  if (a.movementDate !== b.movementDate) diffs.push("movementDate");
  if (a.bankReference !== b.bankReference) diffs.push("bankReference");
  if (a.clientCompanyId !== b.clientCompanyId) diffs.push("clientCompanyId");
  if (a.clientName !== b.clientName) diffs.push("clientName");
  if (a.simpleState !== b.simpleState) diffs.push("simpleState");
  if (a.isDuplicate !== b.isDuplicate) diffs.push("isDuplicate");
  if (a.isHidden !== b.isHidden) diffs.push("isHidden");
  return diffs;
}

/** Clases tipográficas para descripción completa (sin truncar). */
export const BANK_MOVEMENT_DESCRIPTION_CLASS =
  "whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text";

/** Compacto solo en cards mobile de lista; el detalle nunca lo usa. */
export const BANK_MOVEMENT_DESCRIPTION_COMPACT_CLASS = `line-clamp-4 ${BANK_MOVEMENT_DESCRIPTION_CLASS}`;
