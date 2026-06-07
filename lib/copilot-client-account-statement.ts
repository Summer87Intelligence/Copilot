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

/** Línea secundaria informativa debajo del movimiento principal (igual que Zeta). */
export type MovementDetailLine = {
  /** Concepto, medio de pago u otro texto descriptivo. */
  label: string;
  /** Importe en columna Debe (solo informativo — NO modifica el saldo). */
  debit?: number;
  /** Importe en columna Haber (solo informativo — NO modifica el saldo). */
  credit?: number;
};

export type AccountStatementMovement = {
  /** ID estable: fila DB. */
  id: string;
  /** Fecha del movimiento como YYYY-MM-DD (sin zona horaria). */
  date: string;
  kind: AccountStatementMovementKind;
  /** Número visible: invoice_number o receipt_number. */
  number: string;
  /** Texto breve (legacy / UI web). El PDF usa `detailLines` para más riqueza. */
  detail: string;
  currency: AccountStatementCurrency;
  /** Aumenta el saldo del cliente (factura, NC negativa). */
  debit: number;
  /** Disminuye el saldo del cliente (recibo, NC). */
  credit: number;
  /** Saldo acumulado al cerrar este movimiento (ASC). */
  runningBalance: number;
  /** Líneas secundarias para el PDF: conceptos, importes, medio de pago. No alteran el saldo. */
  detailLines: readonly MovementDetailLine[];
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
  /**
   * Saldo base antes del primer movimiento en DB para esta moneda.
   * Representa historial no sincronizado (e.g. recibos pre-período fuera de cobertura de sync).
   * Valor positivo = deuda previa; negativo = crédito previo (cliente saldo a favor).
   * Siempre 0 cuando no se configura (default backward-compatible).
   */
  baselineBalance: number;
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

/**
 * Extrae el número de serie visible del comprobante desde `zeta_metadata.zeta_customer_voucher_v1`.
 * Estrategia de prioridad:
 *   1. serie + numero del bloque CCV1 → "A2934"
 *   2. invoice_number crudo → extractSerieNumero lo parsea en la UI
 * Devuelve null cuando no hay metadata CCV1 útil.
 */
function readInvoiceSerieNumero(row: DataRow): string | null {
  const zm = row.zeta_metadata;
  if (!zm || typeof zm !== "object") return null;
  const v1 = (zm as Record<string, unknown>).zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object") return null;
  const serie = String((v1 as Record<string, unknown>).serie ?? "").trim();
  const numero = String((v1 as Record<string, unknown>).numero ?? "").trim();
  if (serie && numero) return `${serie}${numero}`;
  if (numero) return numero;
  return null;
}

/**
 * Lee la descripción del primer ítem del comprobante desde `raw_payload.Lineas`.
 * Soporta variantes de casing del campo Descripcion observadas en payloads Zeta.
 */
function readFirstLineasDescription(row: DataRow): string | null {
  const zm = row.zeta_metadata;
  if (!zm || typeof zm !== "object") return null;
  const v1 = (zm as Record<string, unknown>).zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object") return null;
  const payload = (v1 as Record<string, unknown>).raw_payload;
  if (!payload || typeof payload !== "object") return null;
  const lineas = (payload as Record<string, unknown>).Lineas;
  if (!Array.isArray(lineas) || lineas.length === 0) return null;
  const first = lineas[0] as Record<string, unknown>;
  const desc =
    first["Descripcion"] ??
    first["descripcion"] ??
    first["Concepto"] ??    // clave documentada en RESTFacturaClienteV4Agregar
    first["concepto"] ??
    first["Detalle"] ??
    first["detalle"] ??
    null;
  if (desc == null) return null;
  const s = String(desc).trim();
  return s || null;
}

/** Normaliza "A-768" → "A768", "ZETA:COB:2732" → null (IDs internos). */
function normalizeReceiptReference(ref: unknown): string | null {
  if (ref == null) return null;
  const s = String(ref).trim();
  if (!s) return null;
  // Rechazar referencias internas tipo "ZETA:COB:2732" o cualquier cosa con ":"
  if (s.includes(":")) return null;
  // Quitar guiones internos entre letra y número: "A-768" → "A768"
  const normalized = s.replace(/^([A-Za-z]+)-(\d+)$/, "$1$2");
  return normalized || null;
}

function invoiceDetail(row: DataRow): string {
  const desc = readFirstLineasDescription(row);
  if (desc) return desc;
  // Evitar mostrar categorías técnicas del pipeline de sync Zeta
  const cat = row.category == null ? "" : String(row.category).trim();
  if (cat && !cat.startsWith("Zeta /")) return cat;
  return compactText(row.status, "");
}

function receiptDetail(row: DataRow): string {
  // El número visible (A768) ya va en la columna Serie y Nº; aquí solo mostramos el medio de pago.
  return compactText(row.payment_method, "");
}

/**
 * Retorna todas las líneas de `raw_payload.Lineas` de un comprobante.
 * Defensivo: cualquier forma inválida devuelve array vacío.
 */
function readRawPayloadLineas(row: DataRow): Array<Record<string, unknown>> {
  try {
    const zm = row.zeta_metadata;
    if (!zm || typeof zm !== "object") return [];
    const v1 = (zm as Record<string, unknown>).zeta_customer_voucher_v1;
    if (!v1 || typeof v1 !== "object") return [];
    const rp = (v1 as Record<string, unknown>).raw_payload;
    if (!rp || typeof rp !== "object") return [];
    const lineas = (rp as Record<string, unknown>).Lineas;
    if (!Array.isArray(lineas)) return [];
    return (lineas as unknown[]).filter((l) => l && typeof l === "object") as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

/**
 * Construye las líneas de detalle secundarias para facturas/NCs desde `raw_payload.Lineas`.
 * Para facturas: el importe va en Debe. Para NCs: va en Haber.
 * Si no hay Lineas, devuelve array vacío (sin detalle).
 */
function buildInvoiceDetailLines(row: DataRow, isCreditNote: boolean): readonly MovementDetailLine[] {
  const lineas = readRawPayloadLineas(row);
  if (lineas.length === 0) return [];
  return lineas.map((l) => {
    const concepto = String(l["Concepto"] ?? l["Descripcion"] ?? l["descripcion"] ?? l["Detalle"] ?? "").trim();
    const notas = String(l["Notas"] ?? "").trim();
    const label = concepto && notas ? `${concepto} · ${notas}` : concepto || notas || "—";
    const totalRaw = l["Total"];
    const total = totalRaw != null ? parseFloat(String(totalRaw)) : NaN;
    const amount = Number.isFinite(total) && total > 0 ? round2(total) : undefined;
    return isCreditNote
      ? { label, credit: amount }
      : { label, debit: amount };
  });
}

/** Construye la línea de detalle secundaria para recibos (medio de pago). */
function buildReceiptDetailLines(row: DataRow): readonly MovementDetailLine[] {
  const pm = String(row.payment_method ?? "").trim();
  if (!pm) return [];
  return [{ label: pm }];
}

/**
 * Retorna `true` para registros derivados del pipeline de saldos pendientes Zeta.
 * Estos representan el saldo vivo sincronizado, NO comprobantes contables reales emitidos.
 * Se excluyen del libro mayor (ledgerMode) para evitar duplicar movimientos con los comprobantes CCV1.
 */
function isSaldosPendientesRow(row: DataRow): boolean {
  return row.category === "Zeta / saldos pendientes";
}

/**
 * Lee el código CFE tipo desde dos fuentes en orden de prioridad:
 *   1. `zeta_customer_voucher_v1.cfe_tipo` (string, puesto por el mapper)
 *   2. `zeta_customer_voucher_v1.raw_payload.CFETipo` (entero PascalCase del API Zeta)
 *
 * Datos reales (tenant El País S.A.): invoices → 111, NC → 112.
 */
function readInvoiceCfeTipo(row: DataRow): number | null {
  const zm = row.zeta_metadata;
  if (!zm || typeof zm !== "object") return null;
  const v1 = (zm as Record<string, unknown>).zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object") return null;
  // Fuente primaria: campo normalizado por el mapper
  const raw = (v1 as Record<string, unknown>).cfe_tipo;
  if (raw != null && raw !== "") {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n)) return n;
  }
  // Fuente secundaria: campo PascalCase en raw_payload (API Zeta directo)
  const payload = (v1 as Record<string, unknown>).raw_payload;
  if (payload && typeof payload === "object") {
    const rawCfe = (payload as Record<string, unknown>).CFETipo;
    if (rawCfe != null) {
      const n = parseInt(String(rawCfe), 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Detecta notas de crédito por código CFE DGI (Uruguay):
 *   112 = e-Nota de Crédito de e-Boleta de Contado  ← tenant real (confirmado A391, El País S.A.)
 *   181 = e-Nota de Crédito de e-Factura
 *   182 = e-Nota de Débito / NC variante e-Boleta
 *
 * Solo se usa en `ledgerMode: true` (estado de cuenta contable).
 */
function invoiceIsCfeCreditNote(row: DataRow): boolean {
  const tipo = readInvoiceCfeTipo(row);
  return tipo === 112 || tipo === 181 || tipo === 182;
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
  list: AccountStatementMovement[],
  baseline: number = 0
): AccountStatementByCurrency {
  const sorted = list.slice().sort(compareMovements);
  let running = baseline;
  let totalDebit = 0;
  let totalCredit = 0;
  let totalCreditNotes = 0;
  for (const m of sorted) {
    running += m.debit - m.credit;
    m.runningBalance = round2(running);
    totalDebit += m.debit;
    totalCredit += m.credit;
    if (m.kind === "credit_note") totalCreditNotes += m.credit;
  }
  // finalBalance = baseline + Σ(debit) − Σ(credit) — saldo real incluyendo historial pre-sync
  const finalBalance = round2(running);
  // hasCreditNoteSupport refleja si se detectaron NCs reales vía CFE tipo 181/182.
  const hasCreditNoteSupport = totalCreditNotes > 0;
  return {
    currency,
    baselineBalance: baseline,
    summary: {
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      finalBalance,
      totalInvoiced: round2(totalDebit),
      totalCollected: round2(totalCredit - totalCreditNotes),
      totalCreditNotes: round2(totalCreditNotes),
      pendingBalance: finalBalance,
      movementCount: sorted.length,
      hasCreditNoteSupport,
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
  /**
   * Saldo UYU anterior al primer movimiento registrado en DB.
   * Usar cuando Zeta confirma un "saldo anterior" que no se puede reconstruir
   * desde proto_invoices/proto_receipts (historial pre-sync).
   * Positivo = deuda previa; negativo = crédito previo.
   * Se almacena en `proto_companies.ledger_opening_balance_uyu`.
   */
  openingBalanceUyu?: number | null;
  /**
   * Saldo USD anterior al primer movimiento registrado en DB.
   * Ídem que `openingBalanceUyu` pero para la moneda USD.
   * Se almacena en `proto_companies.ledger_opening_balance_usd`.
   */
  openingBalanceUsd?: number | null;
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
    // En modo ledger: excluir registros del pipeline de saldos pendientes.
    // Representan el saldo vivo sincronizado, no comprobantes contables reales;
    // duplicarían movimientos ya presentes via comprobantes CCV1.
    if (ledgerMode && isSaldosPendientesRow(inv)) continue;

    const cur = symbolToIso(readInvoiceCurrency(inv));
    if (!cur) {
      unknownCurrencyCount += 1;
      continue;
    }
    const total = parseAmount(inv.total_amount);
    if (!(total > 0)) continue;
    const date = ymdToString(parseRowYmd(inv, "issue_date"), inv.issue_date);
    const number = readInvoiceSerieNumero(inv) ?? String(inv.invoice_number ?? "").trim();

    // En modo ledger: detectar notas de crédito por CFE tipo 181/182.
    // Se tratan como crédito (Haber) en el libro mayor, no como débito (Debe).
    const isCreditNote = ledgerMode && invoiceIsCfeCreditNote(inv);

    const movement: AccountStatementMovement = {
      id: String(inv.id ?? ""),
      date,
      kind: isCreditNote ? "credit_note" : "invoice",
      number,
      detail: invoiceDetail(inv),
      currency: cur,
      debit: isCreditNote ? 0 : round2(total),
      credit: isCreditNote ? round2(total) : 0,
      runningBalance: 0,
      detailLines: buildInvoiceDetailLines(inv, isCreditNote),
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
    const number =
      normalizeReceiptReference(rec.reference) ??
      String(rec.receipt_number ?? "").trim();
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
      detailLines: buildReceiptDetailLines(rec),
      raw: rec,
    };
    (cur === "USD" ? usd : uyu).push(movement);
  }

  return {
    uyu: buildByCurrency("UYU", uyu, input.openingBalanceUyu ?? 0),
    usd: buildByCurrency("USD", usd, input.openingBalanceUsd ?? 0),
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
      return "Ajuste";
  }
}
