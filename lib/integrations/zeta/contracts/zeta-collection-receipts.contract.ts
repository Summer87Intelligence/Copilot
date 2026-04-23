/**
 * Contrato Query **recibos de cobro** listados vía `QueryComprobantes` (Zeta `asoapreciboscobranzav2`).
 *
 * Fuentes:
 * - `docs/zeta/markdown/0165-ayuda-apis-indice-de-apis-gestion-y-contabilidad-recibo-de-cobro-58a116e7.md`
 * - `docs/zeta/markdown/0134-ayuda-apis-metodos-generales-b5ca3a44.md` (`QueryOut.Response[]`)
 *
 * Rutas permitidas (sin `Object.values`, sin barrido heurístico):
 * 1) `QueryOut.Response[]`
 * 2) Raíz `[]` (listado plano de recibos)
 *
 * Cada fila debe incluir `RegistroId` (clave de recibo en la documentación Zeta).
 */

import { logZetaError } from "@/lib/integrations/zeta/zeta-logger";
import { resolveZetaCollectionReceiptsRestMethod } from "@/lib/integrations/zeta/zeta-collection-receipts-rest-method";

export type ZetaCollectionReceiptRecord = Readonly<Record<string, unknown>>;

const QUERY_OUT_NAMES = ["QueryOut", "queryOut"] as const;
const RESPONSE_NAMES = ["Response", "response"] as const;
const REGISTRO_ID_NAMES = ["RegistroId", "registroId"] as const;

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

function readQueryOutRoot(data: unknown): Record<string, unknown> | null {
  if (!isPlainObject(data)) return null;
  for (const name of QUERY_OUT_NAMES) {
    const q = readOwnCaseInsensitive(data, name);
    if (isPlainObject(q)) return q;
  }
  return null;
}

function readResponseArrayFromQueryOut(data: unknown): unknown[] | null {
  const qo = readQueryOutRoot(data);
  if (!qo) return null;
  for (const name of RESPONSE_NAMES) {
    const resp = readOwnCaseInsensitive(qo, name);
    if (Array.isArray(resp)) return resp;
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
  const fromOut = readResponseArrayFromQueryOut(data);
  if (fromOut !== null) return true;
  if (Array.isArray(data)) {
    if (data.length === 0) return true;
    return data.every(rowHasRegistroId);
  }
  return false;
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
  const fromOut = readResponseArrayFromQueryOut(data);
  if (fromOut !== null) {
    if (!fromOut.every(rowHasRegistroId)) {
      logContract("QueryOut.Response incluye filas sin RegistroId.", {
        path: "QueryOut.Response",
        length: fromOut.length,
      });
      return [];
    }
    return freezeRows(fromOut);
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (!data.every(rowHasRegistroId)) {
      logContract("Array raíz con filas sin RegistroId.", { path: "<root-array>", length: data.length });
      return [];
    }
    return freezeRows(data);
  }
  logContract("No coincide con QueryOut.Response ni array raíz.", {
    root_type: data === null ? "null" : typeof data,
  });
  return [];
}

const LAST_PAGE_NAMES = ["IsLastPage", "isLastPage"] as const;
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

export function readZetaCollectionReceiptsQueryOutFlags(data: unknown): {
  isLastPage: boolean | null;
  total: number | undefined;
} {
  const qo = readQueryOutRoot(data);
  if (!qo) return { isLastPage: null, total: undefined };
  return {
    isLastPage: readFirstBoolean(qo, LAST_PAGE_NAMES),
    total: readFirstNumber(qo, TOTAL_NAMES),
  };
}

/**
 * Algunas respuestas repiten `IsLastPage` en la última fila (documentación mezcla encabezado con columnas).
 */
export function readIsLastPageFromReceiptRows(rows: ZetaCollectionReceiptRecord[]): boolean | null {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1] as Record<string, unknown>;
  return readFirstBoolean(last, LAST_PAGE_NAMES);
}
