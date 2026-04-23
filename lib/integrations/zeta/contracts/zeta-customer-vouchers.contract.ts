/**
 * Contrato Query — comprobantes por cliente (Zeta `asoapcomprobantesclientev1` / REST v1).
 *
 * Fuentes:
 * - WSDL: https://api.zetasoftware.com/z.apis.asoapcomprobantesclientev1?wsdl
 * - Ayuda: `docs/zeta/markdown/0156-ayuda-apis-indice-de-apis-gestion-y-contabilidad-comprobantes-por-cliente-ee99ca82.md`
 *
 * Rutas de datos **explícitas** (sin `Object.values`, sin barrido de claves arbitrario):
 * 1) `ComprobantesClienteV1QueryOut.Response.ListaMovimientos.MovimientoItem` (o `Response[]`).
 * 2) `QueryOut.Response.ListaMovimientos.MovimientoItem` (o `Response[]`) si no aplica (1).
 * 3) Array raíz de encabezados (ejemplo ayuda).
 *
 * Identidad mínima por fila (determinística, documentada en ayuda):
 * - `ComprobanteCodigo` no vacío, **o**
 * - `Serie` + `Numero` ambos no vacíos (encabezado típico).
 */

import { logZetaError } from "@/lib/integrations/zeta/zeta-logger";
import { resolveZetaCustomerVouchersRestMethod } from "@/lib/integrations/zeta/zeta-customer-vouchers-rest-method";

export type ZetaCustomerVoucherRecord = Readonly<Record<string, unknown>>;

const SERVICE_OUT_NAMES = ["ComprobantesClienteV1QueryOut", "comprobantesClienteV1QueryOut"] as const;
const LEGACY_QUERY_OUT_NAMES = ["QueryOut", "queryOut"] as const;
const RESPONSE_NAMES = ["Response", "response"] as const;
const LISTA_MOV_NAMES = ["ListaMovimientos", "listaMovimientos"] as const;
const MOVIMIENTO_ITEM_NAMES = ["MovimientoItem", "movimientoItem"] as const;
const COMPROBANTE_CODIGO_NAMES = ["ComprobanteCodigo", "comprobanteCodigo"] as const;
const SERIE_NAMES = ["Serie", "serie"] as const;
const NUMERO_NAMES = ["Numero", "numero", "Número", "número"] as const;

export const CUSTOMER_VOUCHERS_DATA_PATH = {
  NONE: "NONE",
  ROOT_ARRAY: "<root-array>",
  SVC_LISTA_MOV: "ComprobantesClienteV1QueryOut.Response.ListaMovimientos.MovimientoItem",
  SVC_RESPONSE_ARRAY: "ComprobantesClienteV1QueryOut.Response[]",
  QO_LISTA_MOV: "QueryOut.Response.ListaMovimientos.MovimientoItem",
  QO_RESPONSE_ARRAY: "QueryOut.Response[]",
} as const;

export type CustomerVouchersDataPathLabel = (typeof CUSTOMER_VOUCHERS_DATA_PATH)[keyof typeof CUSTOMER_VOUCHERS_DATA_PATH];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readOwnCaseInsensitive(rec: Record<string, unknown>, canonicalName: string): unknown {
  if (Object.prototype.hasOwnProperty.call(rec, canonicalName)) {
    return rec[canonicalName];
  }
  const want = canonicalName.toLowerCase();
  for (const key of Object.keys(rec)) {
    if (key.toLowerCase() === want) {
      return rec[key];
    }
  }
  return undefined;
}

function readFirstTrimmedString(row: Record<string, unknown>, names: readonly string[]): string {
  for (const n of names) {
    const v = readOwnCaseInsensitive(row, n);
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normalizeMovimientoItemList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (isPlainObject(raw)) {
    for (const n of MOVIMIENTO_ITEM_NAMES) {
      const single = readOwnCaseInsensitive(raw, n);
      if (Array.isArray(single)) return single;
      if (isPlainObject(single)) return [single];
    }
  }
  return null;
}

/**
 * Lee `MovimientoItem[]` desde el nodo `Response` de un `*QueryOut` ya resuelto.
 */
function readMovimientoRowsFromOutEnvelope(outRoot: Record<string, unknown>): {
  rows: unknown[] | null;
  detail: "Response[]" | "Response.ListaMovimientos.MovimientoItem" | null;
} {
  for (const respName of RESPONSE_NAMES) {
    const resp = readOwnCaseInsensitive(outRoot, respName);
    if (resp === null) {
      return { rows: [], detail: "Response[]" };
    }
    if (resp === undefined) continue;
    if (Array.isArray(resp)) {
      return { rows: resp, detail: "Response[]" };
    }
    if (!isPlainObject(resp)) continue;
    const respObj = resp as Record<string, unknown>;
    for (const lmName of LISTA_MOV_NAMES) {
      const lm = readOwnCaseInsensitive(respObj, lmName);
      if (lm === undefined) continue;
      if (lm === null) {
        return { rows: [], detail: "Response.ListaMovimientos.MovimientoItem" };
      }
      const rows = normalizeMovimientoItemList(lm);
      if (rows !== null) {
        return { rows, detail: "Response.ListaMovimientos.MovimientoItem" };
      }
      if (isPlainObject(lm) && Object.keys(lm as Record<string, unknown>).length === 0) {
        return { rows: [], detail: "Response.ListaMovimientos.MovimientoItem" };
      }
    }
  }
  return { rows: null, detail: null };
}

function readTopServiceOut(data: Record<string, unknown>): Record<string, unknown> | null {
  for (const name of SERVICE_OUT_NAMES) {
    const q = readOwnCaseInsensitive(data, name);
    if (isPlainObject(q)) return q;
  }
  return null;
}

function readTopLegacyQueryOut(data: Record<string, unknown>): Record<string, unknown> | null {
  for (const name of LEGACY_QUERY_OUT_NAMES) {
    const q = readOwnCaseInsensitive(data, name);
    if (isPlainObject(q)) return q;
  }
  return null;
}

/**
 * Resuelve movimientos y una etiqueta de ruta fija (orden: envelope servicio → envelope QueryOut → array raíz).
 */
export function extractMovimientoRowsAndPath(data: unknown): {
  path: CustomerVouchersDataPathLabel;
  rows: unknown[] | null;
} {
  if (Array.isArray(data)) {
    return { path: CUSTOMER_VOUCHERS_DATA_PATH.ROOT_ARRAY, rows: data };
  }
  if (!isPlainObject(data)) {
    return { path: CUSTOMER_VOUCHERS_DATA_PATH.NONE, rows: null };
  }

  const svcOut = readTopServiceOut(data);
  if (svcOut) {
    const { rows, detail } = readMovimientoRowsFromOutEnvelope(svcOut);
    if (rows !== null) {
      const path =
        detail === "Response[]"
          ? CUSTOMER_VOUCHERS_DATA_PATH.SVC_RESPONSE_ARRAY
          : CUSTOMER_VOUCHERS_DATA_PATH.SVC_LISTA_MOV;
      return { path, rows };
    }
  }

  const legOut = readTopLegacyQueryOut(data);
  if (legOut) {
    const { rows, detail } = readMovimientoRowsFromOutEnvelope(legOut);
    if (rows !== null) {
      const path =
        detail === "Response[]"
          ? CUSTOMER_VOUCHERS_DATA_PATH.QO_RESPONSE_ARRAY
          : CUSTOMER_VOUCHERS_DATA_PATH.QO_LISTA_MOV;
      return { path, rows };
    }
  }

  return { path: CUSTOMER_VOUCHERS_DATA_PATH.NONE, rows: null };
}

/** Raíz `*QueryOut` para flags (Succeed, IsLastPage, …): prioriza envelope de servicio. */
function readServiceOutRoot(data: unknown): Record<string, unknown> | null {
  if (!isPlainObject(data)) return null;
  return readTopServiceOut(data) ?? readTopLegacyQueryOut(data);
}

function rowHasComprobanteCodigo(row: unknown): boolean {
  if (!isPlainObject(row)) return false;
  for (const cn of COMPROBANTE_CODIGO_NAMES) {
    const v = readOwnCaseInsensitive(row, cn);
    if (v !== undefined && v !== null && String(v).trim() !== "") return true;
  }
  return false;
}

function rowHasSerieNumeroIdentity(row: unknown): boolean {
  if (!isPlainObject(row)) return false;
  const serie = readFirstTrimmedString(row, SERIE_NAMES);
  const numero = readFirstTrimmedString(row, NUMERO_NAMES);
  return Boolean(serie && numero);
}

/** Fila persistible: `ComprobanteCodigo` o par `Serie`+`Numero` (ayuda Zeta encabezado). */
export function rowHasPersistableVoucherIdentity(row: unknown): boolean {
  return rowHasComprobanteCodigo(row) || rowHasSerieNumeroIdentity(row);
}

function logContract(reason: string, detail: Record<string, unknown>) {
  logZetaError({
    request_id: "customer_vouchers_contract",
    endpoint: resolveZetaCustomerVouchersRestMethod(),
    empresa_codigo: "unknown",
    code: "zeta_customer_vouchers_contract",
    message: reason,
    extra: detail,
  });
}

export function isZetaCustomerVouchersQueryResponse(data: unknown): boolean {
  if (Array.isArray(data)) {
    if (data.length === 0) return true;
    return data.every(isPlainObject);
  }
  const { rows } = extractMovimientoRowsAndPath(data);
  return rows !== null;
}

function freezeRows(rows: unknown[]): ZetaCustomerVoucherRecord[] {
  const out: ZetaCustomerVoucherRecord[] = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    out.push(Object.freeze({ ...row }));
  }
  return out;
}

export function diagnoseZetaCustomerVouchersExtraction(data: unknown): {
  path_used: string;
  movimiento_item_count: number;
  rows_with_comprobante_codigo: number;
  rows_with_serie_numero_only: number;
  rows_with_persistable_identity: number;
  would_extract_row_count: number;
} {
  const { path, rows } = extractMovimientoRowsAndPath(data);
  if (rows === null) {
    return {
      path_used: path,
      movimiento_item_count: 0,
      rows_with_comprobante_codigo: 0,
      rows_with_serie_numero_only: 0,
      rows_with_persistable_identity: 0,
      would_extract_row_count: 0,
    };
  }
  const movimiento_item_count = rows.length;
  let withCod = 0;
  let serieNumOnly = 0;
  let persist = 0;
  for (const r of rows) {
    const hasC = rowHasComprobanteCodigo(r);
    if (hasC) withCod += 1;
    if (!hasC && rowHasSerieNumeroIdentity(r)) serieNumOnly += 1;
    if (rowHasPersistableVoucherIdentity(r)) persist += 1;
  }
  const would_extract_row_count = rows.filter((r) => isPlainObject(r) && rowHasPersistableVoucherIdentity(r)).length;
  return {
    path_used: path,
    movimiento_item_count,
    rows_with_comprobante_codigo: withCod,
    rows_with_serie_numero_only: serieNumOnly,
    rows_with_persistable_identity: persist,
    would_extract_row_count,
  };
}

export function extractZetaCustomerVouchers(data: unknown): ZetaCustomerVoucherRecord[] {
  const { path, rows } = extractMovimientoRowsAndPath(data);
  if (rows === null) {
    logContract("Ninguna ruta explícita de comprobantes por cliente coincide con la respuesta.", {
      path,
      root_type: data === null ? "null" : typeof data,
    });
    return [];
  }
  const kept = rows.filter((r) => isPlainObject(r) && rowHasPersistableVoucherIdentity(r));
  if (kept.length < rows.length) {
    logContract("Filas omitidas sin identidad persistible (sin ComprobanteCodigo y sin Serie+Numero).", {
      path,
      raw: rows.length,
      kept: kept.length,
    });
  }
  return freezeRows(kept);
}

const LAST_PAGE_NAMES = ["IsLastPage", "isLastPage", "UltimaPagina", "ultimaPagina"] as const;
const TOTAL_NAMES = ["TotalRegistros", "totalRegistros", "Total", "total"] as const;

function readFirstBoolean(rec: Record<string, unknown>, names: readonly string[]): boolean | null {
  for (const n of names) {
    const v = readOwnCaseInsensitive(rec, n);
    if (typeof v === "boolean") return v;
    if (v === "S" || v === "s") return true;
    if (v === "N" || v === "n") return false;
  }
  return null;
}

function readFirstNumber(rec: Record<string, unknown>, names: readonly string[]): number | undefined {
  for (const n of names) {
    const v = readOwnCaseInsensitive(rec, n);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const parsed = Number(v);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export function readZetaCustomerVouchersQueryOutFlags(data: unknown): {
  isLastPage: boolean | null;
  total: number | undefined;
} {
  const qo = readServiceOutRoot(data);
  if (!qo) return { isLastPage: null, total: undefined };
  return {
    isLastPage: readFirstBoolean(qo, LAST_PAGE_NAMES),
    total: readFirstNumber(qo, TOTAL_NAMES),
  };
}

/** Resumen superficial para `UNEXPECTED CUSTOMER VOUCHERS SHAPE` (sin volcar todo el documento). */
export function summarizeCustomerVouchersUnexpectedShape(data: unknown): Record<string, unknown> {
  if (data === null) return { type: "null" };
  if (Array.isArray(data)) {
    return {
      type: "array",
      length: data.length,
      element_types_head: data.slice(0, 5).map((x) => (x === null ? "null" : typeof x)),
    };
  }
  if (!isPlainObject(data)) {
    return { type: typeof data };
  }
  const keys = Object.keys(data);
  const children: Record<string, string> = {};
  for (const k of keys.slice(0, 16)) {
    const v = data[k];
    if (v === null) children[k] = "null";
    else if (Array.isArray(v)) children[k] = `array(len=${v.length})`;
    else if (isPlainObject(v)) {
      children[k] = `object(keys=${Object.keys(v).slice(0, 10).join(",")})`;
    } else children[k] = typeof v;
  }
  return {
    type: "object",
    key_count: keys.length,
    keys_preview: keys.slice(0, 32),
    children,
  };
}
