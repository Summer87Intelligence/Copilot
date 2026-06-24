const RECEIPT_VOID_STATUSES = new Set([
  "void", "voided", "canceled", "cancelled",
  "anulada", "anulado", "annulled", "annul",
]);

/**
 * Returns true if a receipt status is void-like and should be excluded from
 * cobros totals. Does NOT treat "paid", "applied", "processing", etc. as void —
 * any active non-void receipt counts regardless of its processing state.
 */
export function isReceiptVoidLike(status: unknown): boolean {
  if (status == null) return false;
  return RECEIPT_VOID_STATUSES.has(String(status).trim().toLowerCase());
}
