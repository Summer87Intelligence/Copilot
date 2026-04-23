/**
 * Invariantes puras sobre facturas y recibos para validación de dataset (sin I/O).
 */

function num(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function isMissingTotalAmount(v: unknown): boolean {
  const n = num(v);
  return !Number.isFinite(n) || n <= 0;
}

/**
 * Suma `amount` de recibos por `invoice_id` (solo filas con `invoice_id` no vacío).
 */
export function sumReceiptAmountsByInvoiceId(
  receipts: readonly Record<string, unknown>[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of receipts) {
    const iid = String(row.invoice_id ?? "").trim();
    if (!iid) continue;
    const a = num(row.amount);
    if (!Number.isFinite(a)) continue;
    m.set(iid, (m.get(iid) ?? 0) + a);
  }
  return m;
}

/**
 * Facturas con `total_amount` válido y `balance_amount` finito fuera de [−eps, total+eps].
 */
export function countInvoiceBalanceOutOfRange(
  invoices: readonly Record<string, unknown>[],
  eps: number
): number {
  let c = 0;
  for (const inv of invoices) {
    if (isMissingTotalAmount(inv.total_amount)) continue;
    const T = num(inv.total_amount);
    const B = num(inv.balance_amount);
    if (!Number.isFinite(B)) continue;
    if (B < -eps || B > T + eps) c += 1;
  }
  return c;
}

/**
 * Facturas donde Σ recibos vinculados no cuadra con `balance_amount` respecto al modelo
 * `balance ≈ max(0, total − Σ)` (misma fórmula que antes usaba el sync neutralizado en CRUD; aquí solo
 * calidad de dataset), o
 * donde Σ recibos supera el total.
 */
export function countReceiptsBalanceIncompatible(
  invoices: readonly Record<string, unknown>[],
  receipts: readonly Record<string, unknown>[],
  eps: number
): number {
  const sums = sumReceiptAmountsByInvoiceId(receipts);
  const invById = new Map<string, Record<string, unknown>>();
  for (const inv of invoices) {
    const id = String(inv.id ?? "").trim();
    if (id) invById.set(id, inv);
  }
  const bad = new Set<string>();
  for (const [invoiceId, S] of sums) {
    const inv = invById.get(invoiceId);
    if (!inv) continue;
    if (isMissingTotalAmount(inv.total_amount)) continue;
    const T = num(inv.total_amount);
    const B = num(inv.balance_amount);
    if (!Number.isFinite(B)) continue;
    if (S > T + eps) {
      bad.add(invoiceId);
      continue;
    }
    if (S <= eps) continue;
    const expected = Math.max(0, T - S);
    if (Math.abs(B - expected) > eps) {
      bad.add(invoiceId);
    }
  }
  return bad.size;
}
