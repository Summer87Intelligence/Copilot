/**
 * Estado de cuenta por cliente — vista "Por factura" (read-only, multi-moneda).
 *
 * Fuente de verdad: `proto_invoices.balance_amount` poblado por el pipeline de
 * `RESTFacturaClienteV4QuerySaldosPendientes` (Zeta → Copilot, ya operativo).
 *
 * Diferencia con `copilot-client-account-statement.ts`:
 *  - Aquel arma cuenta corriente con todos los movimientos (facturas + recibos)
 *    y deriva `Saldo = Σ debe − Σ haber`. Si los recibos vienen sin imputación
 *    (caso real del tenant: `Descripcion` 0%, ver `temp-audits/receipt-linking-feasibility.md`),
 *    el saldo total puede quedar engañosamente negativo aunque exista deuda real
 *    por factura individual.
 *  - Este helper construye una vista alternativa basada exclusivamente en
 *    `total_amount` y `balance_amount` de cada factura (lo que Zeta considera
 *    pendiente). Los recibos NO se restan: se listan aparte como
 *    "sin imputación detectable".
 *
 * REGLAS CRÍTICAS:
 *  - NO toca DB, mapper, pipeline, balances, RLS ni `proto_receipts.invoice_id`.
 *  - NO infiere imputaciones: cada recibo queda en `unmatchedReceipts` y NO afecta
 *    el `pendingAmount` por factura.
 *  - NO modifica los inputs (defensa de inmutabilidad).
 *  - Separa estrictamente UYU y USD; `unknownCurrency` se cuenta y descarta.
 *
 * MODOS:
 *  - Operacional (default): respeta `is_active = true`.
 *  - Ledger (`ledgerMode: true`): incluye filas inactivas (facturas archivadas
 *    que ya fueron cobradas, recibos archivados). Diseñado para reportes
 *    contables. La regla de negocio sigue siendo "una factura cobrada debe
 *    seguir apareciendo históricamente aunque esté inactiva operacionalmente".
 */

import type { DataRow } from "@/lib/copilot-data";
import { readInvoiceCurrency } from "@/lib/copilot-datos-invoice-display";
import { readReceiptCurrency } from "@/lib/copilot-datos-receipt-display";
import { parseRowYmd } from "@/lib/copilot-datos-period-filter";

export type InvoiceFocusedCurrency = "UYU" | "USD";

export type InvoiceFocusedStatus = "paid" | "partial" | "pending";

export type InvoiceFocusedRow = {
  /** id estable de `proto_invoices.id`. */
  id: string;
  /** Etiqueta visible (ej. `A-2932`). Si falta, fallback a `invoice_number` técnico. */
  number: string;
  /** Fecha de emisión normalizada `YYYY-MM-DD`. */
  date: string;
  currency: InvoiceFocusedCurrency;
  totalAmount: number;
  /** `total_amount − balance_amount` (clamped a >= 0). Refleja lo cobrado según Zeta. */
  paidAmount: number;
  /** `balance_amount` autoritativo de Zeta. */
  pendingAmount: number;
  status: InvoiceFocusedStatus;
  /** Fila original para detalle / debug. */
  raw: DataRow;
};

export type UnmatchedReceiptRow = {
  id: string;
  number: string;
  date: string;
  currency: InvoiceFocusedCurrency;
  amount: number;
  paymentMethod: string | null;
  reference: string | null;
  raw: DataRow;
};

export type InvoiceFocusedSummary = {
  currency: InvoiceFocusedCurrency;
  /** Σ total_amount de las facturas activas en esta moneda. */
  totalInvoiced: number;
  /** Σ paidAmount. Es lo cobrado contra facturas según Zeta (no recibos sincronizados). */
  totalCollectedApplied: number;
  /** Σ pendingAmount. Saldo pendiente autoritativo según Zeta. */
  totalPending: number;
  invoiceCount: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  /** Cantidad de recibos sincronizados sin imputación (separados, no afectan saldos). */
  unmatchedReceiptCount: number;
  /** Σ amount de recibos no imputados (informativo). */
  unmatchedReceiptAmount: number;
};

export type InvoiceFocusedByCurrency = {
  currency: InvoiceFocusedCurrency;
  summary: InvoiceFocusedSummary;
  /** Facturas ordenadas DESC por fecha (más reciente arriba) y luego por número. */
  invoices: InvoiceFocusedRow[];
  /** Recibos no imputados de esta moneda, orden DESC por fecha. */
  unmatchedReceipts: UnmatchedReceiptRow[];
};

export type ClientAccountStatementByInvoice = {
  uyu: InvoiceFocusedByCurrency;
  usd: InvoiceFocusedByCurrency;
  /** Filas (factura o recibo) descartadas por moneda no determinable. */
  unknownCurrencyCount: number;
};

export type BuildClientAccountStatementByInvoiceInput = {
  invoices: readonly DataRow[];
  receipts: readonly DataRow[];
  /**
   * Capa de uso:
   *  - `false` / no provisto (default): operacional. Filtra `is_active === false`.
   *  - `true`: ledger. Mantiene filas inactivas para reproducir el reporte
   *    "Por factura" histórico (facturas archivadas que ya fueron cobradas).
   */
  ledgerMode?: boolean;
};

function symbolToIso(sym: "$" | "U$S" | null): InvoiceFocusedCurrency | null {
  if (sym === "U$S") return "USD";
  if (sym === "$") return "UYU";
  return null;
}

function parseAmount(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function ymdToString(p: { y: number; m: number; d: number } | null, fallback: unknown): string {
  if (p) {
    return `${String(p.y).padStart(4, "0")}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  const raw = fallback == null ? "" : String(fallback).trim();
  return raw.slice(0, 10);
}

function compactString(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
}

/**
 * Estado por factura derivado únicamente de `total_amount` + `balance_amount`.
 * - `pending <= 0` → `paid`
 * - `pending >= total` → `pending`
 * - resto → `partial`
 */
export function classifyInvoiceFocusedStatus(
  totalAmount: number,
  pendingAmount: number
): InvoiceFocusedStatus {
  if (!(pendingAmount > 0)) return "paid";
  if (pendingAmount >= totalAmount) return "pending";
  return "partial";
}

function compareInvoicesDesc(a: InvoiceFocusedRow, b: InvoiceFocusedRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.number !== b.number) return a.number < b.number ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function compareReceiptsDesc(a: UnmatchedReceiptRow, b: UnmatchedReceiptRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.number !== b.number) return a.number < b.number ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function readInvoiceLabel(row: DataRow): string {
  const inv = String(row.invoice_number ?? "").trim();
  return inv || "—";
}

function buildEmptyByCurrency(currency: InvoiceFocusedCurrency): InvoiceFocusedByCurrency {
  return {
    currency,
    summary: {
      currency,
      totalInvoiced: 0,
      totalCollectedApplied: 0,
      totalPending: 0,
      invoiceCount: 0,
      paidCount: 0,
      partialCount: 0,
      pendingCount: 0,
      unmatchedReceiptCount: 0,
      unmatchedReceiptAmount: 0,
    },
    invoices: [],
    unmatchedReceipts: [],
  };
}

/**
 * Construye el estado de cuenta "Por factura" para un cliente.
 *
 * - Filtra `is_active === false` cuando `ledgerMode !== true` (capa operacional).
 *   Cuando `ledgerMode === true`, mantiene filas inactivas para reproducir el
 *   reporte histórico (factura cobrada → archivada por flujo posterior).
 * - Determina la moneda con `readInvoiceCurrency` y `readReceiptCurrency` (mismos
 *   helpers que la grilla y la cuenta corriente para garantizar consistencia visual).
 * - `paidAmount = max(0, totalAmount − pendingAmount)` para tolerar pequeños desbordes
 *   numéricos (por redondeo en `balance_amount`).
 * - Recibos NO se restan: se listan aparte para evitar imputaciones inferidas.
 * - NO muta los inputs.
 */
export function buildClientAccountStatementByInvoice(
  input: BuildClientAccountStatementByInvoiceInput
): ClientAccountStatementByInvoice {
  const ledgerMode = input.ledgerMode === true;
  const uyu = buildEmptyByCurrency("UYU");
  const usd = buildEmptyByCurrency("USD");
  let unknownCurrencyCount = 0;

  for (const inv of input.invoices) {
    if (!ledgerMode && inv.is_active === false) continue;
    const cur = symbolToIso(readInvoiceCurrency(inv));
    if (!cur) {
      unknownCurrencyCount += 1;
      continue;
    }
    const totalAmount = round2(parseAmount(inv.total_amount));
    if (!(totalAmount > 0)) continue;

    // `balance_amount` autoritativo de Zeta. Si la columna no existe en la fila o es null,
    // el comportamiento conservador es asumir el total pendiente (status `pending`).
    const rawBalance = inv.balance_amount;
    const pendingAmount =
      rawBalance == null
        ? totalAmount
        : Math.max(0, round2(parseAmount(rawBalance)));
    const paidAmount = round2(Math.max(0, totalAmount - pendingAmount));
    const status = classifyInvoiceFocusedStatus(totalAmount, pendingAmount);
    const date = ymdToString(parseRowYmd(inv, "issue_date"), inv.issue_date);
    const row: InvoiceFocusedRow = {
      id: String(inv.id ?? ""),
      number: readInvoiceLabel(inv),
      date,
      currency: cur,
      totalAmount,
      paidAmount,
      pendingAmount,
      status,
      raw: inv,
    };
    const block = cur === "USD" ? usd : uyu;
    block.invoices.push(row);
    block.summary.totalInvoiced = round2(block.summary.totalInvoiced + totalAmount);
    block.summary.totalCollectedApplied = round2(
      block.summary.totalCollectedApplied + paidAmount
    );
    block.summary.totalPending = round2(block.summary.totalPending + pendingAmount);
    block.summary.invoiceCount += 1;
    if (status === "paid") block.summary.paidCount += 1;
    else if (status === "partial") block.summary.partialCount += 1;
    else block.summary.pendingCount += 1;
  }

  for (const rec of input.receipts) {
    if (!ledgerMode && rec.is_active === false) continue;
    const cur = symbolToIso(readReceiptCurrency(rec));
    if (!cur) {
      unknownCurrencyCount += 1;
      continue;
    }
    const amount = round2(parseAmount(rec.amount));
    if (!(amount > 0)) continue;
    const date = ymdToString(parseRowYmd(rec, "receipt_date"), rec.receipt_date);
    const row: UnmatchedReceiptRow = {
      id: String(rec.id ?? ""),
      number: String(rec.receipt_number ?? "").trim() || "—",
      date,
      currency: cur,
      amount,
      paymentMethod: compactString(rec.payment_method),
      reference: compactString(rec.reference),
      raw: rec,
    };
    const block = cur === "USD" ? usd : uyu;
    block.unmatchedReceipts.push(row);
    block.summary.unmatchedReceiptCount += 1;
    block.summary.unmatchedReceiptAmount = round2(
      block.summary.unmatchedReceiptAmount + amount
    );
  }

  uyu.invoices.sort(compareInvoicesDesc);
  usd.invoices.sort(compareInvoicesDesc);
  uyu.unmatchedReceipts.sort(compareReceiptsDesc);
  usd.unmatchedReceipts.sort(compareReceiptsDesc);

  return { uyu, usd, unknownCurrencyCount };
}

/** Etiqueta UI del estado por factura. */
export function describeInvoiceFocusedStatus(status: InvoiceFocusedStatus): string {
  switch (status) {
    case "paid":
      return "Cobrada";
    case "partial":
      return "Parcial";
    case "pending":
      return "Pendiente";
  }
}
