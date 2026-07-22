/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — traduce las razones/alertas
 * internas del motor D (códigos en inglés, `reasons`/`warnings` del motor de
 * matching) a frases legibles en español para la UI operativa. Nunca mostrar
 * el código crudo (p. ej. "EXACT_AMOUNT") en pantalla.
 */

import type { ReconciliationReason, ReconciliationWarning } from "@/lib/bank/intelligence/reconciliation-matching";

export const RECONCILIATION_REASON_LABELS: Record<ReconciliationReason, string> = {
  CONFIRMED_PAYER: "cuenta usada anteriormente por este cliente",
  EXACT_AMOUNT: "mismo importe",
  MATCHING_RECEIPT: "recibo coincidente",
  MATCHING_INVOICE: "factura coincidente",
  DATE_PROXIMITY: "fecha cercana",
  REFERENCE_MATCH: "referencia bancaria coincidente",
  HISTORICAL_PATTERN: "patrón de pagos anteriores de este cliente",
  NORMALIZED_NAME_MATCH: "nombre del pagador coincide con el cliente",
  MULTIPLE_CANDIDATES: "hay más de un candidato posible",
  CURRENCY_MISMATCH: "la moneda no coincide",
  RECEIPT_DATE_DOMINANCE: "este recibo es el más cercano en fecha",
  MANUAL_DRAFT: "búsqueda manual de cliente y recibo",
};

export const RECONCILIATION_WARNING_LABELS: Record<ReconciliationWarning, string> = {
  MULTIPLE_STRONG_CANDIDATES: "hay varios candidatos igual de fuertes: revisar antes de confirmar",
  AMOUNT_DIFFERENCE: "el importe no coincide exactamente",
  SHARED_PAYER: "esta cuenta pagó antes por más de un cliente",
  POSSIBLE_DUPLICATE: "posible duplicado de otro movimiento",
  RECEIPT_ALREADY_RECONCILED: "el recibo ya está conciliado",
  INVOICE_FULLY_PAID: "la factura ya está totalmente paga",
  OUT_OF_DATE_RANGE: "fuera del rango de fechas esperado",
  REVERSED_MOVEMENT: "este movimiento fue revertido",
  NON_COMMERCIAL: "este movimiento no es un ingreso de cliente",
  WORKSPACE_MISMATCH: "el recibo pertenece a otro workspace",
  UNAPPLIED_BALANCE: "queda saldo del recibo sin aplicar",
  RECEIPT_CANDIDATE_COLLISION: "otro movimiento del mismo lote propone el mismo recibo",
  MATCHED_MOVEMENT_AUDIT: "incluido solo para auditoría, no genera conciliación",
  HISTORICAL_SHADOW_AUDIT: "movimiento histórico, solo auditoría",
};

export function reasonLabel(reason: ReconciliationReason): string {
  return RECONCILIATION_REASON_LABELS[reason] ?? reason;
}

export function warningLabel(warning: ReconciliationWarning): string {
  return RECONCILIATION_WARNING_LABELS[warning] ?? warning;
}
