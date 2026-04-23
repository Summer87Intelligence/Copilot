/**
 * Contrato **Query** de datos comerciales de cliente (Zeta `asoapclientev4` / REST v4).
 *
 * Fuentes:
 * - `docs/zeta/markdown/0188-ayuda-apis-indice-de-apis-configuracion-datos-comerciales-cliente-d985dc50.md`
 * - `docs/zeta/markdown/0134-ayuda-apis-metodos-generales-b5ca3a44.md` (Query → `Response` array)
 *
 * Rutas de parseo permitidas (solo estas, sin recorrer objetos genéricos ni `Object.values`):
 * 1) `QueryOut.Response[]` — envelope REST según métodos generales.
 * 2) Raíz `[]` — ejemplo de listado en la ayuda (estructura plana por fila).
 *
 * Cada fila debe incluir la clave `Codigo` (identidad mínima del cliente en Zeta).
 */

import { logZetaError } from "@/lib/integrations/zeta/zeta-logger";
import { resolveZetaCommercialClientRestMethod } from "@/lib/integrations/zeta/zeta-commercial-client-rest-method";

export type ZetaCommercialClientRecord = Readonly<Record<string, unknown>>;

const QUERY_OUT_NAMES = ["QueryOut", "queryOut"] as const;
const RESPONSE_NAMES = ["Response", "response"] as const;
const CODIGO_NAMES = ["Codigo", "codigo"] as const;

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

function rowHasCodigo(row: unknown): boolean {
  if (!isPlainObject(row)) return false;
  for (const cn of CODIGO_NAMES) {
    const v = readOwnCaseInsensitive(row, cn);
    if (v !== undefined && v !== null && String(v).trim() !== "") return true;
  }
  return false;
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

function logContract(reason: string, detail: Record<string, unknown>) {
  logZetaError({
    request_id: "commercial_contract",
    endpoint: resolveZetaCommercialClientRestMethod(),
    empresa_codigo: "unknown",
    code: "zeta_commercial_client_contract",
    message: reason,
    extra: { ...detail },
  });
}

export function isZetaCommercialClientQueryResponse(data: unknown): boolean {
  const fromOut = readResponseArrayFromQueryOut(data);
  if (fromOut !== null) return true;
  if (Array.isArray(data)) {
    if (data.length === 0) return true;
    return data.every(rowHasCodigo);
  }
  return false;
}

function freezeRows(rows: unknown[]): ZetaCommercialClientRecord[] {
  const out: ZetaCommercialClientRecord[] = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    out.push(Object.freeze({ ...row }));
  }
  return out;
}

/**
 * Extrae filas comerciales; valida `Codigo` en cada objeto de `Response` o del array raíz.
 */
export function extractZetaCommercialClientData(data: unknown): ZetaCommercialClientRecord[] {
  const fromOut = readResponseArrayFromQueryOut(data);
  if (fromOut !== null) {
    if (!fromOut.every(rowHasCodigo)) {
      logContract("QueryOut.Response contiene filas sin Codigo válido.", {
        path: "QueryOut.Response",
        length: fromOut.length,
      });
      return [];
    }
    return freezeRows(fromOut);
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (!data.every(rowHasCodigo)) {
      logContract("Array raíz con filas sin Codigo válido.", { path: "<root-array>", length: data.length });
      return [];
    }
    return freezeRows(data);
  }
  logContract("No coincide con QueryOut.Response ni array raíz de filas.", {
    root_type: data === null ? "null" : typeof data,
  });
  return [];
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

export function readZetaCommercialClientQueryOutFlags(data: unknown): {
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
