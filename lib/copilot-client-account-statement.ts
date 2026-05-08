/**
 * Estado de cuenta por cliente (read-only, multi-moneda).
 *
 * Helper puro (sin React) para construir el estado de cuenta a partir de:
 *  - filas de `proto_invoices` ya filtradas por `company_id` (las que devuelve
 *    `getProtoInvoicesByCompany` en el sidebar de Cliente).
 *  - filas de `proto_receipts` ya filtradas por `company_id` (idem
 *    `getProtoReceiptsByCompany`).
 *
 * REGLAS CRÍTICAS:
 *  - NO toca DB, mapper, pipeline, balances, reconciliation, RLS ni imports.
 *  - NO inventa notas de crédito: cuando no hay regla certificada para detectar
 *    NC en la metadata sincronizada (`zeta_customer_voucher_v1.cfe_tipo` /
 *    `raw_payload.ComprobanteTipo` varían por tenant) se reporta el placeholder
 *    `hasCreditNoteSupport = false` y la suma queda en 0.
 *  - NO asume "$" cuando la moneda es indeterminable: el movimiento se suma a
 *    `unknownCurrencyCount` y se descarta del estado de cuenta visible.
 *  - Usa los mismos helpers `readInvoiceCurrency` / `readReceiptCurrency` que la
 *    grilla y el sidebar para garantizar consistencia visual.
 *
 * MODOS:
 *  - Operacional (default): respeta `is_active = true`. Diseñado para el sidebar
 *    operacional cuando el caller pasa filas que ya vienen filtradas o cuando
 *    quiere ignorar registros archivados.
 *  - Ledger (`ledgerMode: true`): NO filtra por `is_active`. Diseñado para
 *    reportes contables / estado de cuenta histórico, donde una factura cobrada
 *    archivada por un flujo posterior debe seguir presente. Usar en conjunto
 *    con `getProtoInvoicesByCompanyForLedger` / `getProtoReceiptsByCompanyForLedger`
 *    para obtener el dataset completo desde la fuente.
 *
 * Saldo acumulado: se calcula en orden cronológico ASC; se exponen también los
 * movimientos en ese orden (`movements`). El consumidor puede invertir para mostrar
 * DESC sin perder consistencia (cada movimiento ya trae `runningBalance` calculado).
 */

import type { DataRow } from "@/lib/copilot-data";
import { readInvoiceCurrency } from "@/lib/copilot-datos-invoice-display";
import { readReceiptCurrency } from "@/lib/copilot-datos-receipt-display";
import { parseRowYmd } from "@/lib/copilot-datos-period-filter";

export type AccountStatementCurrency = "UYU" | "USD";

export type AccountStatementMovementKind = "invoice" | "receipt" | "credit_note";

export type AccountStatementMovement = {
  /** ID estable: fila DB. */
  id: string;
  /** Fecha del movimiento como YYYY-MM-DD (sin zona horaria). */
  date: string;
  kind: AccountStatementMovementKind;
  /** Número visible: invoice_number o receipt_number. */
  number: string;
  /** Texto breve para explicar el origen operativo del movimiento. */
  detail: string;
  currency: AccountStatementCurrency;
  /** Aumenta el saldo del cliente (factura, NC negativa). */
  debit: number;
  /** Disminuye el saldo del cliente (recibo, NC). */
  credit: number;
  /** Saldo acumulado al cerrar este movimiento (ASC). */
  runningBalance: number;
  /** Fila original para tooltip / link / debug. */
  raw: DataRow;
};

export type AccountStatementSummary = {
  /** Suma de columnas Debe. */
  totalDebit: number;
  /** Suma de columnas Haber (recibos + notas de crédito cuando existan). */
  totalCredit: number;
  /** Saldo final de la moneda (= totalDebit - totalCredit). */
  finalBalance: number;
  /** Alias legacy/UI previa: total facturado. */
  totalInvoiced: number;
  /** Alias legacy/UI previa: total cobrado por recibos. */
  totalCollected: number;
  /** Notas de crédito detectadas. Actualmente 0 hasta tener regla certificada. */
  totalCreditNotes: number;
  /** Alias legacy/UI previa: = totalInvoiced - totalCollected - totalCreditNotes */
  pendingBalance: number;
  movementCount: number;
  /**
   * `false` mientras no haya una regla certificada para detectar notas de crédito en
   * `zeta_customer_voucher_v1.cfe_tipo` / `raw_payload.ComprobanteTipo`. Cuando es
   * `false`, el caller debe mostrar el placeholder "Notas de crédito no detectadas".
   */
  hasCreditNoteSupport: boolean;
  /**
   * `true` cuando `finalBalance < 0`: el cliente tiene saldo a favor. Puede deberse a
   * anticipos legítimos o a recibos sin imputación detectable desde Zeta (`QueryComprobantes`
   * no devuelve aplicaciones a facturas — ver auditoría DIV-002 / `temp-audits/receipt-linking-feasibility.md`).
   * El caller debe mostrarlo como nota informativa neutra, NUNCA como error.
   */
  hasNegativeBalance: boolean;
};

export type AccountStatementByCurrency = {
  currency: AccountStatementCurrency;
  summary: AccountStatementSummary;
  /** Movimientos ordenados ASC por (fecha, kind=invoice antes que receipt, número). */
  movements: AccountStatementMovement[];
};

export type ClientAccountStatement = {
  uyu: AccountStatementByCurrency;
  usd: AccountStatementByCurrency;
  /** Movimientos descartados por moneda no determinable (se loggean para debug). */
  unknownCurrencyCount: number;
};

/** Convierte el símbolo devuelto por los helpers (`$`/`U$S`) a ISO. */
function symbolToIso(sym: "$" | "U$S" | null): AccountStatementCurrency | null {
  if (sym === "U$S") return "USD";
  if (sym === "$") return "UYU";
  return null;
}

function parseAmount(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymdToString(p: { y: number; m: number; d: number } | null, fallback: unknown): string {
  if (p) {
    return `${String(p.y).padStart(4, "0")}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  const raw = fallback == null ? "" : String(fallback).trim();
  return raw.slice(0, 10);
}

function compactText(value: unknown, fallback = "—"): string {
  const s = value == null ? "" : String(value).trim();
  return s || fallback;
}

function invoiceDetail(row: DataRow): string {
  return compactText(row.category ?? row.status, "Factura");
}

function receiptDetail(row: DataRow): string {
  const method = compactText(row.payment_method, "");
  const reference = compactText(row.reference, "");
  if (method && reference) return `${method} · ${reference}`;
  if (method) return method;
  if (reference) return reference;
  return "Recibo";
}

/** Orden ASC: fecha, kind (invoice antes que receipt mismo día), número. */
function compareMovements(a: AccountStatementMovement, b: AccountStatementMovement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.kind !== b.kind) {
    // factura primero, luego nota de crédito, luego recibo (el saldo crece y luego baja).
    const order: Record<AccountStatementMovementKind, number> = {
      invoice: 0,
      credit_note: 1,
      receipt: 2,
    };
    return order[a.kind] - order[b.kind];
  }
  if (a.number !== b.number) return a.number < b.number ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildByCurrency(
  currency: AccountStatementCurrency,
  list: AccountStatementMovement[]
): AccountStatementByCurrency {
  const sorted = list.slice().sort(compareMovements);
  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const totalCreditNotes = 0;
  for (const m of sorted) {
    running += m.debit - m.credit;
    m.runningBalance = round2(running);
    totalDebit += m.debit;
    totalCredit += m.credit;
  }
  const finalBalance = round2(totalDebit - totalCredit);
  return {
    currency,
    summary: {
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      finalBalance,
      totalInvoiced: round2(totalDebit),
      totalCollected: round2(totalCredit - totalCreditNotes),
      totalCreditNotes,
      pendingBalance: finalBalance,
      movementCount: sorted.length,
      // Placeholder hasta que haya una regla certificada de detección de NC.
      hasCreditNoteSupport: false,
      hasNegativeBalance: finalBalance < 0,
    },
    movements: sorted,
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export type BuildClientAccountStatementInput = {
  invoices: readonly DataRow[];
  receipts: readonly DataRow[];
  /**
   * Capa de uso:
   *  - `false` / no provisto (default): operacional. Filtra `is_active === false`.
   *  - `true`: ledger / financiero. Mantiene filas inactivas para reproducir
   *    histórico contable. Combinar con `getProtoInvoicesByCompanyForLedger` y
   *    `getProtoReceiptsByCompanyForLedger` para obtener el dataset completo.
   */
  ledgerMode?: boolean;
};

/**
 * Construye el estado de cuenta por moneda para un cliente.
 *
 * - Filtra `is_active === false` cuando `ledgerMode !== true` (capa operacional).
 *   Cuando `ledgerMode === true`, deja pasar las inactivas para reportes
 *   contables/históricos.
 * - Determina la moneda con `readInvoiceCurrency` (facturas) y `readReceiptCurrency`
 *   (recibos). Si no se puede determinar, suma a `unknownCurrencyCount`.
 * - Calcula `runningBalance` por cada movimiento (ASC).
 * - NO mezcla monedas: cada movimiento queda exclusivamente en su tab.
 */
export function buildClientAccountStatement(
  input: BuildClientAccountStatementInput
): ClientAccountStatement {
  const ledgerMode = input.ledgerMode === true;
  const uyu: AccountStatementMovement[] = [];
  const usd: AccountStatementMovement[] = [];
  let unknownCurrencyCount = 0;

  for (const inv of input.invoices) {
    if (!ledgerMode && inv.is_active === false) continue;
    const cur = symbolToIso(readInvoiceCurrency(inv));
    if (!cur) {
      unknownCurrencyCount += 1;
      continue;
    }
    const total = parseAmount(inv.total_amount);
    if (!(total > 0)) continue; // ignoramos facturas con total <= 0 para no contaminar saldo
    const date = ymdToString(parseRowYmd(inv, "issue_date"), inv.issue_date);
    const number = String(inv.invoice_number ?? "").trim();
    const movement: AccountStatementMovement = {
      id: String(inv.id ?? ""),
      date,
      kind: "invoice",
      number,
      detail: invoiceDetail(inv),
      currency: cur,
      debit: round2(total),
      credit: 0,
      runningBalance: 0,
      raw: inv,
    };
    (cur === "USD" ? usd : uyu).push(movement);
  }

  for (const rec of input.receipts) {
    if (!ledgerMode && rec.is_active === false) continue;
    const cur = symbolToIso(readReceiptCurrency(rec));
    if (!cur) {
      unknownCurrencyCount += 1;
      continue;
    }
    const amount = parseAmount(rec.amount);
    if (!(amount > 0)) continue;
    const date = ymdToString(parseRowYmd(rec, "receipt_date"), rec.receipt_date);
    const number = String(rec.receipt_number ?? "").trim();
    const movement: AccountStatementMovement = {
      id: String(rec.id ?? ""),
      date,
      kind: "receipt",
      number,
      detail: receiptDetail(rec),
      currency: cur,
      debit: 0,
      credit: round2(amount),
      runningBalance: 0,
      raw: rec,
    };
    (cur === "USD" ? usd : uyu).push(movement);
  }

  return {
    uyu: buildByCurrency("UYU", uyu),
    usd: buildByCurrency("USD", usd),
    unknownCurrencyCount,
  };
}

/**
 * Formato de importe en estilo es-UY con símbolo de moneda visible.
 *  - UYU → `$ 12.300`
 *  - USD → `U$S 305`
 *
 * Usar para tablas, resúmenes y CSVs internos. NO antepone signo cuando el valor es 0.
 */
export function formatStatementAmount(
  value: number,
  currency: AccountStatementCurrency,
  options: { showZero?: boolean } = {}
): string {
  const { showZero = true } = options;
  if (!Number.isFinite(value)) return "—";
  if (value === 0 && !showZero) return "";
  const sym = currency === "USD" ? "U$S" : "$";
  const formatted = Math.abs(value).toLocaleString("es-UY", { maximumFractionDigits: 2 });
  const signed = value < 0 ? `-${formatted}` : formatted;
  return `${sym} ${signed}`;
}

/** Etiqueta visible del tipo de movimiento. */
export function describeMovementKind(kind: AccountStatementMovementKind): string {
  switch (kind) {
    case "invoice":
      return "Factura";
    case "receipt":
      return "Recibo";
    case "credit_note":
      return "Nota de crédito";
  }
}
