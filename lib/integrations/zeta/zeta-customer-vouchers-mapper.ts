/**
 * Mapeo de fila Zeta (comprobante por cliente) → modelo interno Copilot / `proto_invoices`.
 */

import { createHash } from "node:crypto";

import type { ZetaCustomerVoucherRecord } from "@/lib/integrations/zeta/contracts/zeta-customer-vouchers.contract";
import { cleanZetaString, mapRutField } from "@/lib/integrations/zeta/zeta-client-mapper";
import type { ProtoInvoiceInput } from "@/lib/copilot-proto-crud-types";

export type CopilotCustomerVoucherV1 = {
  schema_version: 1;
  /** Identidad Zeta preferida (encabezado); puede ser null si solo hay Serie+Numero. */
  zeta_comprobante_codigo: string | null;
  /** Código de empresa emisora en Zeta (`EmpresaCodigo`); refuerza clave única por factura. */
  zeta_empresa_codigo: string | null;
  serie: string | null;
  numero: string | null;
  fecha_emision: string | null;
  moneda_codigo: string | null;
  /**
   * Total del comprobante **factura/CFE** para `proto_invoices.total_amount`:
   * encabezado `Total`, si no hay o es 0 → suma `Lineas[].Total` (no `TotalRecibo`).
   */
  total_recibo: number | null;
  /** Saldo explícito en fila Zeta (`extractZetaSaldoFromCustomerVoucherRow`); `null` si el API no lo envía. */
  saldo_recibo: number | null;
  zeta_cliente_codigo: string | null;
  /** Nombre de cliente según Zeta (`ClienteNombre`); vive también dentro de `raw_payload`. */
  zeta_cliente_nombre: string | null;
  cliente_documento: string | null;
  cfe_tipo: string | null;
  cfe_estado: string | null;
  vendedor_codigo: string | null;
  condicion_pago_codigo: string | null;
  /** Resumen: cantidad de líneas / pagos (sin volcar arrays completos en columnas SQL). */
  lineas_count: number;
  pagos_count: number;
  /**
   * `RegistroId` de Zeta en la fila del comprobante (misma factura en `RESTFacturaClienteV4QuerySaldosPendientes`).
   * Se persiste en `zeta_metadata.zeta_customer_voucher_v1` y en `zeta_metadata.zeta_comprobante_identity_v1.registro_id`
   * (clave prioritaria para saldos pendientes).
   */
  zeta_registro_id: string | null;
  raw_payload: Record<string, unknown>;
};

/**
 * Misma regla que el contrato de extracción: `ComprobanteCodigo` o `Serie`+`Numero` no vacíos en fila Zeta.
 */
export function copilotCustomerVoucherHasPersistableIdentity(m: CopilotCustomerVoucherV1): boolean {
  if (m.zeta_comprobante_codigo && m.zeta_comprobante_codigo.trim()) return true;
  if (m.serie && m.serie.trim() && m.numero != null && String(m.numero).trim() !== "") return true;
  return false;
}

/**
 * Cruce **vouchers ↔ saldos pendientes**: misma normalización que `mapZetaCustomerVoucherToCopilot` +
 * `buildZetaCustomerVoucherInvoiceNumber` (p. ej. `ZETA:CCV1:{Empresa}:{Cliente}:{Serie}:{Numero}`).
 * Útil cuando la fila de `RESTFacturaClienteV4QuerySaldosPendientes` trae los mismos campos de identidad
 * que el encabezado de comprobante (Serie, Numero, ClienteCodigo, EmpresaCodigo, ComprobanteCodigo, Fecha).
 */
export function resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow(
  row: ZetaCustomerVoucherRecord
): string | null {
  const m = mapZetaCustomerVoucherToCopilot(row);
  if (!copilotCustomerVoucherHasPersistableIdentity(m)) return null;
  return buildZetaCustomerVoucherInvoiceNumber(m);
}

function readOwn(row: ZetaCustomerVoucherRecord, names: readonly string[]): unknown {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(row, n)) return row[n];
    const want = n.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === want) return row[k];
    }
  }
  return undefined;
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Importes Zeta con formato regional (ej. `56.852,00` → 56852).
 * Si hay `.` y `,`, se asume: `.` miles y `,` decimal.
 */
export function parseZetaDecimal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v).trim();
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function countChildren(row: ZetaCustomerVoucherRecord, keys: readonly string[]): number {
  for (const k of keys) {
    const v = readOwn(row, [k]);
    if (Array.isArray(v)) return v.length;
  }
  return 0;
}

const LINEAS_TOTAL_KEYS = ["Total", "total", "SubTotal", "subtotal", "Importe", "importe"] as const;

function readLineAmount(line: Record<string, unknown>): number | null {
  for (const k of LINEAS_TOTAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(line, k)) continue;
    const raw = line[k];
    const n = parseZetaDecimal(raw) ?? parseNumber(raw);
    if (n != null && Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Suma importes de `Lineas` / `LineasComprobante` (cada ítem puede traer `Total`, `Importe`, etc.).
 */
/**
 * Campos de saldo que algunos tenants devuelven en `MovimientoItem` aunque la ayuda pública
 * de `RESTComprobantesClienteV1Query` solo liste `TotalRecibo` (sin `Saldo` explícito).
 */
const ZETA_INVOICE_SALDO_KEYS = [
  "Saldo",
  "SaldoComprobante",
  "SaldoRecibo",
  "ImportePendiente",
  "SaldoPendiente",
  "MontoPendiente",
  "TotalPendiente",
] as const;

/**
 * Primer saldo numérico explícito en la fila (incluye **0**). Si ningún campo conocido aporta número, `null`.
 */
export function extractZetaSaldoFromCustomerVoucherRow(
  row: ZetaCustomerVoucherRecord
): number | null {
  for (const name of ZETA_INVOICE_SALDO_KEYS) {
    const v = readOwn(row, [name]);
    if (v === undefined) continue;
    const n = parseZetaDecimal(v) ?? parseNumber(v);
    if (n != null && Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Suma cobros aplicados al comprobante desde `Pagos` / `FormasPago` (ayuda Zeta: `MonedaComprobanteMonto` / `MonedaPagoMonto`).
 * Sirve de respaldo cuando no viene `Saldo` pero sí líneas de cobro.
 */
export function sumZetaPagosAppliedMonto(row: ZetaCustomerVoucherRecord): number | null {
  const keys = ["Pagos", "pagos", "FormasPago", "formasPago"] as const;
  for (const k of keys) {
    const v = readOwn(row, [k]);
    if (!Array.isArray(v) || v.length === 0) continue;
    let sum = 0;
    let any = false;
    for (const item of v) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      const readItem = (names: readonly string[]) => {
        for (const n of names) {
          if (Object.prototype.hasOwnProperty.call(rec, n)) return rec[n];
          const want = n.toLowerCase();
          for (const rk of Object.keys(rec)) {
            if (rk.toLowerCase() === want) return rec[rk];
          }
        }
        return undefined;
      };
      const rawComp = readItem(["MonedaComprobanteMonto", "monedaComprobanteMonto"]);
      const rawPago = readItem(["MonedaPagoMonto", "monedaPagoMonto"]);
      const m =
        (rawComp !== undefined ? parseZetaDecimal(rawComp) ?? parseNumber(rawComp) : null) ??
        (rawPago !== undefined ? parseZetaDecimal(rawPago) ?? parseNumber(rawPago) : null);
      if (m != null && Number.isFinite(m) && m > 0) {
        sum += m;
        any = true;
      }
    }
    if (any) return sum;
  }
  return null;
}

export function sumZetaLineasTotales(row: ZetaCustomerVoucherRecord): number | null {
  const keys = ["Lineas", "lineas", "LineasComprobante", "lineasComprobante"] as const;
  let arr: unknown[] | null = null;
  for (const k of keys) {
    const v = readOwn(row, [k]);
    if (Array.isArray(v) && v.length > 0) {
      arr = v;
      break;
    }
  }
  if (!arr) return null;
  let sum = 0;
  let any = false;
  for (const item of arr) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const n = readLineAmount(item as Record<string, unknown>);
    if (n != null) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

/**
 * Total factura para `proto_invoices.total_amount` (regla Zeta confirmada):
 * 1) `Total` / `total` de encabezado si es > 0
 * 2) si no, suma de `Lineas[].Total` (u otros importes de línea)
 *
 * No usar `TotalRecibo` como total de factura CFE (evita mezclar conceptos con recibos de cobranza).
 */
export function resolveZetaInvoiceTotalAmount(row: ZetaCustomerVoucherRecord): number | null {
  const headerTotal =
    parseZetaDecimal(readOwn(row, ["Total", "total"])) ?? parseNumber(readOwn(row, ["Total", "total"]));
  if (headerTotal != null && headerTotal > 0) {
    return headerTotal;
  }
  const lineSum = sumZetaLineasTotales(row);
  if (lineSum != null && lineSum > 0) {
    return lineSum;
  }
  if (headerTotal != null && Number.isFinite(headerTotal)) {
    return headerTotal;
  }
  return null;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Normaliza fecha Zeta a `YYYY-MM-DD`.
 * Soporta:
 * - `YYYYMMDD` (ej: `20260107`)
 * - `YYYY-MM-DD`
 * - `YYYY/MM/DD`
 * - `YYYY-MM-DDTHH:mm:ss...` (toma solo la parte de fecha)
 */
export function normalizeZetaIssueDateYmd(fecha: string | null): string | null {
  const s = (fecha ?? "").trim();
  if (!s) return null;

  // Caso principal Zeta: YYYYMMDD
  const mCompact = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (mCompact) {
    const y = Number(mCompact[1]);
    const mo = Number(mCompact[2]);
    const d = Number(mCompact[3]);
    if (isValidYmd(y, mo, d)) {
      return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const head = s.slice(0, 10);
  const mDash = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (mDash) {
    const y = Number(mDash[1]);
    const mo = Number(mDash[2]);
    const d = Number(mDash[3]);
    if (isValidYmd(y, mo, d)) return `${mDash[1]}-${mDash[2]}-${mDash[3]}`;
  }

  const mSlash = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(head);
  if (mSlash) {
    const y = Number(mSlash[1]);
    const mo = Number(mSlash[2]);
    const d = Number(mSlash[3]);
    if (isValidYmd(y, mo, d)) {
      return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  return null;
}

/** Solo equivalencias explícitas; cualquier otro valor → `issued`. */
const CFE_ESTADO_EXACT: Record<string, string> = {
  ANULADO: "cancelled",
  CANCELADA: "cancelled",
  CANCELADO: "cancelled",
  PAGADO: "paid",
  PAGADA: "paid",
  COBRADO: "paid",
  COBRADA: "paid",
  VENCIDO: "overdue",
  VENCIDA: "overdue",
};

function mapCfeEstadoToProtoStatus(cfe: string | null): string {
  if (!cfe) return "issued";
  const k = String(cfe).trim().toUpperCase();
  return CFE_ESTADO_EXACT[k] ?? "issued";
}

/** Partes de clave seguras para `invoice_number` (índice único tenant+cliente+número). */
export function sanitizeZetaInvoiceKeyPart(s: string | null | undefined, maxLen = 64): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  return t.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, maxLen);
}

/**
 * Hash legacy (incluye `fecha_emision`): puede divergir si Zeta cambia el string de fecha
 * o duplicar la misma factura con distinto hash. Solo se usa para **encontrar filas viejas** al fusionar.
 */
export function buildZetaCustomerVoucherInvoiceNumberLegacyHash(m: CopilotCustomerVoucherV1): string {
  const h = createHash("sha256")
    .update(
      JSON.stringify({
        cc: m.zeta_cliente_codigo ?? "",
        comp: m.zeta_comprobante_codigo,
        serie: m.serie ?? "",
        num: m.numero ?? "",
        fe: m.fecha_emision ?? "",
      })
    )
    .digest("hex")
    .slice(0, 40);
  return `ZETA:CC:${h}`;
}

const MAX_INVOICE_NUMBER_LEN = 220;

/**
 * Clave idempotente por **factura individual** (no usar `ComprobanteCodigo` solo: se repite entre CFE distintos).
 *
 * Forma principal: `ZETA:CCV1:{EmpresaCodigo}:{ClienteCodigo}:{Serie}:{Numero}`
 * (ej. `ZETA:CCV1:250218923:CLI001:A:2828`; equivalente compacto sin cliente solo si no hubiera `ClienteCodigo` → `NCLI`).
 * `EmpresaCodigo` ausente → `0`. `ClienteCodigo` ausente → `NCLI`.
 */
export function buildZetaCustomerVoucherInvoiceNumber(m: CopilotCustomerVoucherV1): string {
  const ser = sanitizeZetaInvoiceKeyPart(m.serie, 16);
  const num = sanitizeZetaInvoiceKeyPart(m.numero != null ? String(m.numero) : "", 32);
  if (ser && num) {
    const emp = sanitizeZetaInvoiceKeyPart(m.zeta_empresa_codigo, 28) || "0";
    const cli = sanitizeZetaInvoiceKeyPart(m.zeta_cliente_codigo, 24) || "NCLI";
    return `ZETA:CCV1:${emp}:${cli}:${ser}:${num}`.slice(0, MAX_INVOICE_NUMBER_LEN);
  }
  const cli = sanitizeZetaInvoiceKeyPart(m.zeta_cliente_codigo, 24) || "NCLI";
  const tipo = sanitizeZetaInvoiceKeyPart(m.cfe_tipo, 16) || "CF";
  const comp = sanitizeZetaInvoiceKeyPart(m.zeta_comprobante_codigo, 48);
  if (comp) {
    const h = createHash("sha256")
      .update(
        JSON.stringify({
          comp,
          cc: m.zeta_cliente_codigo ?? "",
          tipo,
          fe: m.fecha_emision ?? "",
        })
      )
      .digest("hex")
      .slice(0, 28);
    return `ZETA:CCV1:NOSER:${cli}:${tipo}:${comp}:${h}`.slice(0, MAX_INVOICE_NUMBER_LEN);
  }
  return buildZetaCustomerVoucherInvoiceNumberLegacyHash(m);
}

/** Clave antigua basada solo en `ComprobanteCodigo` (migración / dedupe). */
export function buildZetaCustomerVoucherInvoiceNumberLegacyCompKey(m: CopilotCustomerVoucherV1): string | null {
  const comp = sanitizeZetaInvoiceKeyPart(m.zeta_comprobante_codigo, 96);
  if (!comp) return null;
  return `ZETA:CCV1:COMP:${comp}`.slice(0, MAX_INVOICE_NUMBER_LEN);
}

export function mapZetaCustomerVoucherToCopilot(row: ZetaCustomerVoucherRecord): CopilotCustomerVoucherV1 {
  const raw_payload: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    raw_payload[k] = row[k];
  }

  const comprobanteCodigo = cleanZetaString(readOwn(row, ["ComprobanteCodigo", "comprobanteCodigo"]));
  const empresaCodigo = cleanZetaString(readOwn(row, ["EmpresaCodigo", "empresaCodigo", "Empresa", "empresa"]));
  const serie = cleanZetaString(readOwn(row, ["Serie", "serie"]));
  const numeroRaw = readOwn(row, ["Numero", "numero", "Número", "número"]);
  const numero = numeroRaw !== undefined && numeroRaw !== null ? String(numeroRaw).trim() : null;
  const fecha = cleanZetaString(readOwn(row, ["Fecha", "fecha"]));
  const moneda = cleanZetaString(readOwn(row, ["MonedaCodigo", "monedaCodigo"]));
  const total = resolveZetaInvoiceTotalAmount(row);
  const clienteCodigo = cleanZetaString(readOwn(row, ["ClienteCodigo", "clienteCodigo"]));
  const clienteNombre = cleanZetaString(readOwn(row, ["ClienteNombre", "clienteNombre"]));
  const clienteDoc = mapRutField(readOwn(row, ["ClienteDocumento", "clienteDocumento", "RUT", "rut"]));
  const registroRaw = readOwn(row, ["RegistroId", "registroId"]);
  const zeta_registro_id =
    registroRaw !== undefined && registroRaw !== null && String(registroRaw).trim() !== ""
      ? String(registroRaw).trim()
      : null;

  return {
    schema_version: 1,
    zeta_comprobante_codigo: comprobanteCodigo,
    zeta_empresa_codigo: empresaCodigo,
    serie,
    numero,
    fecha_emision: fecha,
    moneda_codigo: moneda,
    total_recibo: total,
    saldo_recibo: extractZetaSaldoFromCustomerVoucherRow(row),
    zeta_cliente_codigo: clienteCodigo,
    zeta_cliente_nombre: clienteNombre,
    cliente_documento: clienteDoc,
    cfe_tipo: cleanZetaString(readOwn(row, ["CFETipo", "cfeTipo", "CfeTipo"])),
    cfe_estado: cleanZetaString(readOwn(row, ["CFEEstado", "cfeEstado", "CfeEstado"])),
    vendedor_codigo: cleanZetaString(readOwn(row, ["VendedorCodigo", "vendedorCodigo"])),
    condicion_pago_codigo: cleanZetaString(readOwn(row, ["CondicionPagoCodigo", "condicionPagoCodigo"])),
    lineas_count: countChildren(row, ["Lineas", "lineas", "LineasComprobante", "lineasComprobante"]),
    pagos_count: countChildren(row, ["Pagos", "pagos", "FormasPago", "formasPago"]),
    zeta_registro_id,
    raw_payload,
  };
}

/**
 * Resultado del mapeo voucher Zeta → `ProtoInvoiceInput`.
 *
 * Si la fila Zeta no permite construir un `ProtoInvoiceInput` válido (típicamente:
 * `fecha_emision` con formato no soportado por `normalizeZetaIssueDateYmd`), el
 * resultado es `{ ok: false, reason }` y el pipeline DEBE saltear la fila + loggear
 * estructuradamente. Nunca hay que persistir con un fallback "fecha de hoy"
 * porque eso desplaza la factura del mes correcto y rompe enrichment / reconciliación.
 *
 * Razones posibles:
 * - `invalid_fecha_emision`: `fecha_emision` ausente o no parseable como YYYYMMDD /
 *   YYYY-MM-DD / YYYY/MM/DD. Anti-fallback `new Date()` (causa raíz documentada en
 *   `temp-audits/audit-abril-2026-report.md` H1).
 */
export type MapVoucherToProtoInvoiceResult =
  | { ok: true; input: ProtoInvoiceInput }
  | { ok: false; reason: "invalid_fecha_emision"; raw_fecha_emision: string | null };

/**
 * Arma `ProtoInvoiceInput`:
 * - `total_amount`: total CFE (`resolveZetaInvoiceTotalAmount` → `total_recibo`).
 * - `balance_amount`: **siempre 0** en ingesta por comprobantes; el saldo real lo aplica exclusivamente
 *   `RESTFacturaClienteV4QuerySaldosPendientes` (`runZetaSaldosPendientesPipeline` / `sync-saldos-pendientes`),
 *   cruzando por `resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow` → misma `invoice_number` `ZETA:CCV1:…`.
 *
 * Validación crítica de `fecha_emision`:
 * - Si `normalizeZetaIssueDateYmd` retorna null, el resultado es `{ ok: false, ... }`.
 * - Esto reemplaza el viejo fallback `?? new Date().toISOString().slice(0,10)` que
 *   movía la factura al día del re-sync (mes equivocado) — ver `KNOWN-DIVERGENCES.md`
 *   y auditoría `temp-audits/audit-abril-2026-report.md` H1.
 */
export function mapCopilotCustomerVoucherToProtoInvoiceInput(
  companyId: string,
  mapped: CopilotCustomerVoucherV1,
  syncRunId: string
): MapVoucherToProtoInvoiceResult {
  const issue = normalizeZetaIssueDateYmd(mapped.fecha_emision);
  if (!issue) {
    return {
      ok: false,
      reason: "invalid_fecha_emision",
      raw_fecha_emision: mapped.fecha_emision ?? null,
    };
  }
  const due = addDaysIso(issue, 30);
  const total = mapped.total_recibo ?? 0;
  const status = mapCfeEstadoToProtoStatus(mapped.cfe_estado);
  const balance_amount = 0;
  const invNum = buildZetaCustomerVoucherInvoiceNumber(mapped);
  const notes = `zeta_vouchers:${syncRunId}|${mapped.zeta_comprobante_codigo ?? "?"}|${mapped.serie ?? ""}-${mapped.numero ?? ""}`.slice(0, 500);
  return {
    ok: true,
    input: {
      company_id: companyId,
      invoice_number: invNum,
      issue_date: issue,
      due_date: due,
      total_amount: total,
      balance_amount,
      status,
      category: "Zeta / comprobantes por cliente",
      notes,
    },
  };
}

function addDaysIso(issueYmd: string, days: number): string {
  const d = new Date(`${issueYmd.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
