/**
 * Contrato Query **recibos de cobro** listados vía `QueryComprobantes`
 * (Zeta `asoapreciboscobranzav2`).
 *
 * Fuentes:
 * - `docs/zeta/markdown/0165-…recibo-de-cobro-58a116e7.md` (parámetros y campos).
 * - `docs/zeta/postman/Api ZetaSoftware collection.json` (item
 *   `RESTRecibosCobranzaV2QueryComprobantes`, body `QueryComprobantesOut.Response[]`).
 * - `docs/vendors/z/KNOWN-DIVERGENCES.md` (DIV-002).
 *
 * Shapes soportados (en orden de detección):
 *
 * 1. **`QueryComprobantesOut.Response[]`** — Postman oficial (forma real del tenant).
 * 2. `QueryOut.Response[]` — método genérico documentado en `0134` (compat).
 * 3. Array raíz `[]` — listado plano observado en algunos métodos REST.
 * 4. Cualquier `*Out` con un array interno reconocible (`Recibos`, `Items`, `Data`,
 *    `Result`, etc.) — fallback defensivo, mismo patrón que DIV-001 ventas
 *    detalladas en `lib/integrations/zeta/zeta-ventas-detalladas-fetch.ts`.
 *
 * Cada fila debe incluir `RegistroId` (clave de recibo en la documentación Zeta);
 * filas sin `RegistroId` se filtran (se loggea el rechazo).
 */

import { logZetaError } from "@/lib/integrations/zeta/zeta-logger";
import { resolveZetaCollectionReceiptsRestMethod } from "@/lib/integrations/zeta/zeta-collection-receipts-rest-method";

export type ZetaCollectionReceiptRecord = Readonly<Record<string, unknown>>;

const OUTER_NAMES = [
  "QueryComprobantesOut",
  "queryComprobantesOut",
  "QueryOut",
  "queryOut",
] as const;

const RESPONSE_KEYS = [
  "Response",
  "response",
  "Recibos",
  "recibos",
  "Comprobantes",
  "comprobantes",
  "Items",
  "items",
  "Data",
  "data",
  "Result",
  "result",
] as const;

const REGISTRO_ID_NAMES = ["RegistroId", "registroId"] as const;
const LAST_PAGE_NAMES = ["IsLastPage", "isLastPage"] as const;
const TOTAL_NAMES = [
  "TotalRegistros",
  "totalRegistros",
  "Total",
  "total",
] as const;

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

function readOuterRoot(data: unknown): { name: string; node: Record<string, unknown> } | null {
  if (!isPlainObject(data)) return null;
  for (const name of OUTER_NAMES) {
    const q = readOwnCaseInsensitive(data, name);
    if (isPlainObject(q)) return { name, node: q };
  }
  return null;
}

function rowHasRegistroId(row: unknown): boolean {
  if (!isPlainObject(row)) return false;
  for (const n of REGISTRO_ID_NAMES) {
    const v = readOwnCaseInsensitive(row, n);
    if (v !== undefined && v !== null && String(v).trim() !== "") return true;
  }
  return false;
}

/**
 * Busca un array dentro del nodo `*Out` priorizando claves conocidas.
 * Retorna `{ key, arr }` o `null` si no encuentra.
 */
function firstArrayInOuter(
  outer: Record<string, unknown>
): { key: string; arr: unknown[] } | null {
  for (const k of RESPONSE_KEYS) {
    const v = readOwnCaseInsensitive(outer, k);
    if (Array.isArray(v)) return { key: k, arr: v };
  }
  for (const k of Object.keys(outer)) {
    const v = outer[k];
    if (Array.isArray(v)) return { key: k, arr: v };
  }
  return null;
}

function findRows(
  data: unknown
): { rows: unknown[]; path: string } | null {
  if (Array.isArray(data)) {
    return { rows: data, path: "<root-array>" };
  }
  if (!isPlainObject(data)) return null;

  const outer = readOuterRoot(data);
  if (outer) {
    const inside = firstArrayInOuter(outer.node);
    if (inside) {
      return { rows: inside.arr, path: `${outer.name}.${inside.key}` };
    }
  }

  for (const k of OUTER_NAMES) {
    const v = readOwnCaseInsensitive(data, k);
    if (Array.isArray(v)) {
      return { rows: v, path: `${k}:array` };
    }
  }

  return null;
}

function logContract(reason: string, detail: Record<string, unknown>) {
  logZetaError({
    request_id: "collection_receipts_contract",
    endpoint: resolveZetaCollectionReceiptsRestMethod(),
    empresa_codigo: "unknown",
    code: "zeta_collection_receipts_contract",
    message: reason,
    extra: detail,
  });
}

export function isZetaCollectionReceiptsQueryResponse(data: unknown): boolean {
  const found = findRows(data);
  if (found === null) return false;
  if (found.rows.length === 0) return true;
  return found.rows.every(rowHasRegistroId);
}

function freezeRows(rows: unknown[]): ZetaCollectionReceiptRecord[] {
  const out: ZetaCollectionReceiptRecord[] = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    out.push(Object.freeze({ ...row }));
  }
  return out;
}

export function extractZetaCollectionReceipts(data: unknown): ZetaCollectionReceiptRecord[] {
  const found = findRows(data);
  if (found === null) {
    logContract("No coincide con QueryComprobantesOut.Response, QueryOut.Response, ni array raíz.", {
      root_type: data === null ? "null" : typeof data,
      top_level_keys: isPlainObject(data) ? Object.keys(data).slice(0, 16) : null,
    });
    return [];
  }
  if (found.rows.length === 0) return [];
  if (!found.rows.every(rowHasRegistroId)) {
    logContract(`Filas sin RegistroId en ${found.path}.`, {
      path: found.path,
      length: found.rows.length,
      first_keys: isPlainObject(found.rows[0]) ? Object.keys(found.rows[0] as Record<string, unknown>).slice(0, 16) : null,
    });
    return [];
  }
  return freezeRows(found.rows);
}

/**
 * Diagnóstico read-only del shape JSON recibido. No muta. Sirve para el log
 * `kind: "zeta_receipts_raw_response"` y para test de regresión.
 */
export type ZetaCollectionReceiptsResponseShape = {
  typeof_root: string;
  is_array_root: boolean;
  top_level_keys: string[];
  outer_key_detected: string | null;
  outer_keys: string[];
  array_path_detected: string | null;
  array_paths_detected: string[];
  rows_detected: number;
  first_item_preview: Record<string, unknown> | null;
  first_item_keys: string[];
  has_registro_id_first_item: boolean | null;
};

function summarizeFirstItem(rows: unknown[]): {
  preview: Record<string, unknown> | null;
  keys: string[];
  hasRegistroId: boolean | null;
} {
  if (rows.length === 0) return { preview: null, keys: [], hasRegistroId: null };
  const first = rows[0];
  if (!isPlainObject(first)) {
    return { preview: { _type: typeof first, _value: String(first).slice(0, 200) }, keys: [], hasRegistroId: null };
  }
  const keys = Object.keys(first).slice(0, 32);
  const preview: Record<string, unknown> = {};
  for (const k of keys.slice(0, 16)) {
    const v = first[k];
    if (v === null || typeof v !== "object") preview[k] = v;
    else if (Array.isArray(v)) preview[k] = `[array length=${v.length}]`;
    else preview[k] = `[object keys=${Object.keys(v as Record<string, unknown>).slice(0, 8).join(",")}]`;
  }
  return { preview, keys, hasRegistroId: rowHasRegistroId(first) };
}

function collectArrayPaths(data: unknown, maxDepth = 3): string[] {
  const found: string[] = [];
  function walk(node: unknown, prefix: string, depth: number) {
    if (depth > maxDepth) return;
    if (Array.isArray(node)) {
      found.push(`${prefix || "<root>"}[length=${node.length}]`);
      return;
    }
    if (!isPlainObject(node)) return;
    for (const k of Object.keys(node)) {
      const v = node[k];
      const next = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) {
        found.push(`${next}[length=${v.length}]`);
      } else if (isPlainObject(v)) {
        walk(v, next, depth + 1);
      }
    }
  }
  walk(data, "", 0);
  return found.slice(0, 24);
}

export function summarizeZetaCollectionReceiptsResponseShape(
  data: unknown
): ZetaCollectionReceiptsResponseShape {
  const isArr = Array.isArray(data);
  const isObj = isPlainObject(data);
  const found = findRows(data);
  const outer = isObj ? readOuterRoot(data) : null;
  const item = summarizeFirstItem(found?.rows ?? []);

  return {
    typeof_root: data === null ? "null" : typeof data,
    is_array_root: isArr,
    top_level_keys: isObj ? Object.keys(data as Record<string, unknown>).slice(0, 24) : [],
    outer_key_detected: outer?.name ?? null,
    outer_keys: outer ? Object.keys(outer.node).slice(0, 24) : [],
    array_path_detected: found?.path ?? null,
    array_paths_detected: collectArrayPaths(data),
    rows_detected: found?.rows.length ?? 0,
    first_item_preview: item.preview,
    first_item_keys: item.keys,
    has_registro_id_first_item: item.hasRegistroId,
  };
}

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

export function readZetaCollectionReceiptsQueryOutFlags(data: unknown): {
  isLastPage: boolean | null;
  total: number | undefined;
} {
  const outer = readOuterRoot(data);
  if (!outer) return { isLastPage: null, total: undefined };
  return {
    isLastPage: readFirstBoolean(outer.node, LAST_PAGE_NAMES),
    total: readFirstNumber(outer.node, TOTAL_NAMES),
  };
}

/**
 * Algunas respuestas repiten `IsLastPage` en la última fila (la documentación
 * Zeta mezcla encabezado con columnas).
 */
export function readIsLastPageFromReceiptRows(rows: ZetaCollectionReceiptRecord[]): boolean | null {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1] as Record<string, unknown>;
  return readFirstBoolean(last, LAST_PAGE_NAMES);
}
