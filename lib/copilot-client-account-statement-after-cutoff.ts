/**
 * Movimientos posteriores al corte de un estado de cuenta histórico.
 *
 * USO:
 *  Cuando el usuario está mirando el estado de cuenta del cliente con un rango
 *  cerrado (ej. PDF de Zeta `01/12/2025 → 17/04/2026`), esta función toma los
 *  movimientos sincronizados que caen DESPUÉS del `to` y los devuelve agrupados
 *  por moneda. La UI los muestra en un panel "Movimientos posteriores al corte"
 *  para explicar por qué el saldo actual difiere del PDF.
 *
 * REGLAS:
 *  - Recibe `invoices` y `receipts` SIN filtrar por período (lo hace acá).
 *  - Sólo devuelve filas con `date > to`. Si `to` es null/vacío → array vacío.
 *  - Modo de actividad: el `ledgerMode` se respeta para que el panel reproduzca
 *    el mismo conjunto que la cuenta corriente histórica (incluye archivadas).
 *  - Determina la moneda con los mismos helpers que el resto del estado de cuenta
 *    (`readInvoiceCurrency` / `readReceiptCurrency`) — coherencia visual total.
 *  - NO toca DB, sync, mappers, balances, RLS ni linking factura↔recibo.
 *  - NO infiere imputaciones. Cada movimiento conserva su naturaleza (factura
 *    suma debe / recibo suma haber).
 */

import type { DataRow } from "@/lib/copilot-data";
import { readInvoiceCurrency } from "@/lib/copilot-datos-invoice-display";
import { readReceiptCurrency } from "@/lib/copilot-datos-receipt-display";
import { normalizeYmdInput, parseRowYmd } from "@/lib/copilot-datos-period-filter";

export type AfterCutoffCurrency = "UYU" | "USD";

export type AfterCutoffMovementKind = "invoice" | "receipt";

export type AfterCutoffMovement = {
  /** ID estable de la fila DB. */
  id: string;
  kind: AfterCutoffMovementKind;
  /** YYYY-MM-DD agnóstico de zona horaria. */
  date: string;
  /** Número visible (`invoice_number` o `receipt_number`). */
  number: string;
  /** Etiqueta legible: "A-2895", "A-722", etc. */
  seriesNumber: string;
  currency: AfterCutoffCurrency;
  /** Aumenta el saldo (factura). */
  debit: number;
  /** Disminuye el saldo (recibo). */
  credit: number;
  /** Fila original para tooltip / debug. */
  raw: DataRow;
};

export type AfterCutoffByCurrency = {
  currency: AfterCutoffCurrency;
  /** Movimientos ordenados ASC por fecha (los más cercanos al corte primero). */
  movements: AfterCutoffMovement[];
  /** Σ debit. */
  totalDebit: number;
  /** Σ credit. */
  totalCredit: number;
  /**
   * Impacto neto desde el corte: `Σ credit − Σ debit`.
   *  - Positivo → cobranzas posteriores reducen el saldo (cliente baja deuda).
   *  - Negativo → ventas posteriores aumentan el saldo (cliente acumula deuda).
   * Se expresa así (no como `debit − credit`) porque la pregunta UX es
   * "¿qué tanto bajó/subió el saldo después del corte?".
   */
  netImpact: number;
};

export type ClientAfterCutoff = {
  uyu: AfterCutoffByCurrency;
  usd: AfterCutoffByCurrency;
};

export type BuildClientAfterCutoffInput = {
  invoices: readonly DataRow[];
  receipts: readonly DataRow[];
  /** Fecha de corte (`to`) del rango activo, en YYYY-MM-DD. Si es null/inválida → no hay corte. */
  toDate: string | null | undefined;
  /** Mismo flag que en los otros helpers: `true` para ledger histórico. */
  ledgerMode?: boolean;
};

function symbolToIso(sym: "$" | "U$S" | null): AfterCutoffCurrency | null {
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

/**
 * Extrae "Serie-Número" de un identificador `proto_invoices` (formato
 * `ZETA:CCV1:{empresa}:{cliente}:{serie}:{numero}`) o de `reference` para recibos.
 * Retorna el `fallback` si no parsea.
 */
function formatSeriesNumber(
  raw: DataRow,
  kind: AfterCutoffMovementKind,
  fallback: string
): string {
  if (kind === "receipt") {
    const ref = String(raw?.reference ?? "").trim();
    const m1 = /^([A-Za-z])\s*[-]?\s*0*(\d+)/.exec(ref);
    if (m1) return `${m1[1].toUpperCase()}-${m1[2]}`;
  }
  const num = String(fallback ?? "").trim();
  if (!num) return "—";
  const m2 = /:([A-Za-z]+):0*(\d+)\s*$/.exec(num);
  if (m2) return `${m2[1].toUpperCase()}-${m2[2]}`;
  return num;
}

function emptyByCurrency(currency: AfterCutoffCurrency): AfterCutoffByCurrency {
  return { currency, movements: [], totalDebit: 0, totalCredit: 0, netImpact: 0 };
}

function pushMovement(block: AfterCutoffByCurrency, m: AfterCutoffMovement) {
  block.movements.push(m);
  block.totalDebit = round2(block.totalDebit + m.debit);
  block.totalCredit = round2(block.totalCredit + m.credit);
  block.netImpact = round2(block.totalCredit - block.totalDebit);
}

function compareAsc(a: AfterCutoffMovement, b: AfterCutoffMovement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // factura primero, recibo después (mismo orden que la cuenta corriente)
  if (a.kind !== b.kind) return a.kind === "invoice" ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Construye los movimientos posteriores al corte agrupados por moneda.
 *
 * - Si `toDate` no es válido → retorna ambos bloques vacíos (no hay corte).
 * - Si una fila no tiene fecha parseable → se descarta silenciosamente.
 * - Si la moneda no se puede determinar → se descarta (sin contar `unknownCurrency`,
 *   que ya lo gestiona el otro helper). El propósito de este panel es UX, no auditoría.
 */
export function buildClientAfterCutoffMovements(
  input: BuildClientAfterCutoffInput
): ClientAfterCutoff {
  const to = normalizeYmdInput(input.toDate);
  const uyu = emptyByCurrency("UYU");
  const usd = emptyByCurrency("USD");
  if (!to) return { uyu, usd };

  const ledgerMode = input.ledgerMode === true;

  for (const inv of input.invoices) {
    if (!ledgerMode && inv.is_active === false) continue;
    const cur = symbolToIso(readInvoiceCurrency(inv));
    if (!cur) continue;
    const total = round2(parseAmount(inv.total_amount));
    if (!(total > 0)) continue;
    const date = ymdToString(parseRowYmd(inv, "issue_date"), inv.issue_date);
    if (!date || date <= to) continue;
    const number = String(inv.invoice_number ?? "").trim();
    const movement: AfterCutoffMovement = {
      id: String(inv.id ?? ""),
      kind: "invoice",
      date,
      number,
      seriesNumber: formatSeriesNumber(inv, "invoice", number),
      currency: cur,
      debit: total,
      credit: 0,
      raw: inv,
    };
    pushMovement(cur === "USD" ? usd : uyu, movement);
  }

  for (const rec of input.receipts) {
    if (!ledgerMode && rec.is_active === false) continue;
    const cur = symbolToIso(readReceiptCurrency(rec));
    if (!cur) continue;
    const amount = round2(parseAmount(rec.amount));
    if (!(amount > 0)) continue;
    const date = ymdToString(parseRowYmd(rec, "receipt_date"), rec.receipt_date);
    if (!date || date <= to) continue;
    const number = String(rec.receipt_number ?? "").trim();
    const movement: AfterCutoffMovement = {
      id: String(rec.id ?? ""),
      kind: "receipt",
      date,
      number,
      seriesNumber: formatSeriesNumber(rec, "receipt", number),
      currency: cur,
      debit: 0,
      credit: amount,
      raw: rec,
    };
    pushMovement(cur === "USD" ? usd : uyu, movement);
  }

  uyu.movements.sort(compareAsc);
  usd.movements.sort(compareAsc);
  return { uyu, usd };
}
