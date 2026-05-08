/**
 * Resumen de DEUDA ACTUAL del cliente (read-only, multi-moneda).
 *
 * Este helper responde la pregunta "¿cuánto debe HOY este cliente?" y se
 * presenta como bloque fijo en el sidebar, INDEPENDIENTE de los filtros de
 * período del estado de cuenta (mes/año, rango, corte histórico).
 *
 * Fuente de verdad:
 *  - `proto_invoices.balance_amount` poblado por `RESTFacturaClienteV4QuerySaldosPendientes`.
 *
 * REGLAS CRÍTICAS:
 *  - NO usa recibos.
 *  - NO usa Debe/Haber del ledger.
 *  - NO infiere linking factura↔recibo.
 *  - NO depende de filtros del panel.
 *  - NO modifica los inputs.
 *  - Procesa el dataset ledger COMPLETO del cliente: incluye activas e inactivas
 *    para reflejar deuda real (una factura archivada cobrada sigue contando
 *    como "cobrada" en el histórico financiero, una archivada con saldo > 0
 *    sigue siendo deuda real).
 *  - Excluye comprobantes con `status` que indique anulación/cancelación —
 *    set conservador (`void`, `voided`, `canceled`, `cancelled`, `annulled`,
 *    `null`-equivalentes Zeta) comparado en lowercase.
 *  - Usa `readInvoiceCurrency` (mismo helper que la grilla y el resto del
 *    estado de cuenta) para garantizar consistencia visual.
 *
 * Reglas numéricas:
 *  - `pendingAmount = max(0, balance_amount ?? total_amount)`. Cuando Zeta
 *    no envía `balance_amount`, asumimos pendiente = total (peor caso financiero).
 *  - `paidAmount = max(0, total_amount - pendingAmount)`.
 *  - Clasificación:
 *    - `pendingAmount <= 0`           → paid
 *    - `pendingAmount >= totalAmount` → pending
 *    - resto                          → partial
 *  - Facturas con `total_amount <= 0` se ignoran (no contaminan totales).
 *  - Filas con moneda indeterminable se descartan (sin asumir UYU/USD).
 */

import type { DataRow } from "@/lib/copilot-data";
import { readInvoiceCurrency } from "@/lib/copilot-datos-invoice-display";

export type CurrentDebtCurrencyCode = "UYU" | "USD";

export type CurrentDebtCurrencySummary = {
  currencyCode: CurrentDebtCurrencyCode;
  /** Σ pendingAmount de todas las facturas válidas en esta moneda. */
  totalPending: number;
  /** Σ total_amount facturado histórico en esta moneda. */
  totalInvoiced: number;
  /** Σ paidAmount = totalInvoiced - totalPending (clamp >= 0). */
  totalPaidByZeta: number;
  invoiceCount: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
};

export type ClientCurrentDebtSummary = {
  /** Solo monedas con al menos una factura válida; orden estable USD → UYU. */
  currencies: CurrentDebtCurrencySummary[];
  /** `true` si alguna moneda registra `totalPending > 0`. */
  hasPendingDebt: boolean;
  /** Cantidad total de facturas con moneda válida procesadas. Útil para empty state. */
  totalInvoiceCount: number;
  /** Comprobantes ignorados por estar marcados como anulados/cancelados. */
  voidedCount: number;
  /** Filas descartadas por moneda indeterminable. */
  unknownCurrencyCount: number;
};

export type BuildClientCurrentDebtSummaryInput = {
  invoices: readonly DataRow[];
};

const VOIDED_STATUSES: ReadonlySet<string> = new Set([
  "void",
  "voided",
  "canceled",
  "cancelled",
  "anulada",
  "anulado",
  "annulled",
  "annul",
]);

function symbolToIso(sym: "$" | "U$S" | null): CurrentDebtCurrencyCode | null {
  if (sym === "U$S") return "USD";
  if (sym === "$") return "UYU";
  return null;
}

export function parseFinancialAmount(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function roundFinancial2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function isVoidedFinancialInvoice(row: DataRow): boolean {
  const s = String(row.status ?? "").trim().toLowerCase();
  if (!s) return false;
  return VOIDED_STATUSES.has(s);
}

export function readFinancialInvoiceCurrency(row: DataRow): CurrentDebtCurrencyCode | null {
  return symbolToIso(readInvoiceCurrency(row));
}

type Bucket = {
  totalPending: number;
  totalInvoiced: number;
  totalPaidByZeta: number;
  invoiceCount: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
};

function emptyBucket(): Bucket {
  return {
    totalPending: 0,
    totalInvoiced: 0,
    totalPaidByZeta: 0,
    invoiceCount: 0,
    paidCount: 0,
    partialCount: 0,
    pendingCount: 0,
  };
}

export function classifyFinancialInvoiceStatus(
  totalAmount: number,
  pendingAmount: number
): "paid" | "partial" | "pending" {
  if (!(pendingAmount > 0)) return "paid";
  if (pendingAmount >= totalAmount) return "pending";
  return "partial";
}

export function calculateFinancialInvoiceAmounts(row: DataRow): {
  totalAmount: number;
  pendingAmount: number;
  paidAmount: number;
} {
  const totalAmount = roundFinancial2(parseFinancialAmount(row.total_amount));
  const rawBalance = row.balance_amount;
  const pendingAmount =
    rawBalance == null
      ? totalAmount
      : Math.max(0, roundFinancial2(parseFinancialAmount(rawBalance)));
  const paidAmount = roundFinancial2(Math.max(0, totalAmount - pendingAmount));
  return { totalAmount, pendingAmount, paidAmount };
}

/**
 * Construye el resumen de deuda actual a partir del dataset ledger del cliente.
 * Recibir el dataset COMPLETO (sin filtros de período) — el helper devuelve
 * lo que el cliente debe HOY según Zeta.
 */
export function buildClientCurrentDebtSummary(
  input: BuildClientCurrentDebtSummaryInput
): ClientCurrentDebtSummary {
  const buckets: Record<CurrentDebtCurrencyCode, Bucket> = {
    USD: emptyBucket(),
    UYU: emptyBucket(),
  };
  let voidedCount = 0;
  let unknownCurrencyCount = 0;
  let totalInvoiceCount = 0;

  for (const inv of input.invoices) {
    if (isVoidedFinancialInvoice(inv)) {
      voidedCount += 1;
      continue;
    }
    const cur = readFinancialInvoiceCurrency(inv);
    if (!cur) {
      unknownCurrencyCount += 1;
      continue;
    }
    const { totalAmount, pendingAmount, paidAmount } = calculateFinancialInvoiceAmounts(inv);
    if (!(totalAmount > 0)) continue;
    const status = classifyFinancialInvoiceStatus(totalAmount, pendingAmount);

    const b = buckets[cur];
    b.totalInvoiced = roundFinancial2(b.totalInvoiced + totalAmount);
    b.totalPending = roundFinancial2(b.totalPending + pendingAmount);
    b.totalPaidByZeta = roundFinancial2(b.totalPaidByZeta + paidAmount);
    b.invoiceCount += 1;
    if (status === "paid") b.paidCount += 1;
    else if (status === "partial") b.partialCount += 1;
    else b.pendingCount += 1;

    totalInvoiceCount += 1;
  }

  const order: readonly CurrentDebtCurrencyCode[] = ["USD", "UYU"];
  const currencies: CurrentDebtCurrencySummary[] = order
    .filter((code) => buckets[code].invoiceCount > 0)
    .map((code) => ({ currencyCode: code, ...buckets[code] }));

  const hasPendingDebt = currencies.some((c) => c.totalPending > 0);

  return {
    currencies,
    hasPendingDebt,
    totalInvoiceCount,
    voidedCount,
    unknownCurrencyCount,
  };
}
