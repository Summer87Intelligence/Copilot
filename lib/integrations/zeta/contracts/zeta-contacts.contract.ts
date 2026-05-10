/**
 * Contrato RESTContactosV3Query — shape real: `QueryOut.Response[]`.
 *
 * DIV-003 (2026-05-09): el contrato original asumía `QueryOut.Contactos.Contacto[]`
 * pero la colección Postman oficial y el tenant real devuelven `QueryOut.Response[]`.
 * Se mantiene retrocompat con el shape asumido por si hay variantes de tenant.
 *
 * Prioridad de extracción:
 *   1. QueryOut.Response[]          ← Postman oficial + tenant real
 *   2. QueryOut.Contactos[]         ← array directo (variante defensiva)
 *   3. QueryOut.Contactos.Contacto  ← asunción original (retrocompat)
 */

import { logZetaError } from "@/lib/integrations/zeta/zeta-logger";

/** Fila cruda tal como viene en el array de respuesta Zeta (campos PascalCase). */
export type ZetaContact = Readonly<Record<string, unknown>>;

const QUERY_OUT_NAMES = ["QueryOut", "queryOut"] as const;

// Claves candidatas del array de filas dentro de QueryOut (en orden de prioridad)
const ROW_ARRAY_KEYS = [
  "Response",  "response",    // Postman + tenant real (DIV-003)
  "Contactos", "contactos",   // variante alternativa
  "Items",     "items",
  "Data",      "data",
  "Result",    "result",
  "Rows",      "rows",
] as const;

// Clave del array individual dentro de un wrapper objeto (shape original asumido)
const CONTACTO_NAMES = ["Contacto", "contacto"] as const;

const LAST_PAGE_NAMES = ["IsLastPage", "isLastPage", "UltimaPagina", "ultimaPagina"] as const;
const TOTAL_NAMES = ["TotalRegistros", "totalRegistros", "Total", "total"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readOwnCaseInsensitive(
  rec: Record<string, unknown>,
  canonicalName: string
): unknown {
  if (Object.prototype.hasOwnProperty.call(rec, canonicalName)) {
    return rec[canonicalName];
  }
  const want = canonicalName.toLowerCase();
  for (const key of Object.keys(rec)) {
    if (key.toLowerCase() === want) return rec[key];
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

/**
 * Dado el nodo `QueryOut`, busca el primer array de filas usando `ROW_ARRAY_KEYS`.
 * Retorna `{ rows, path }` o `{ rows: [], path: null }`.
 */
function findRowsInQueryOut(queryOut: Record<string, unknown>): {
  rows: ZetaContact[];
  path: string | null;
} {
  for (const key of ROW_ARRAY_KEYS) {
    const candidate = readOwnCaseInsensitive(queryOut, key);
    if (candidate === undefined) continue;

    // Array directo: QueryOut.Response[], QueryOut.Contactos[], etc.
    if (Array.isArray(candidate)) {
      return {
        rows: candidate.filter(isPlainObject).map((r) => Object.freeze({ ...r })),
        path: `QueryOut.${key}`,
      };
    }

    // Objeto wrapper: QueryOut.Contactos.Contacto[] (shape original asumido)
    if (isPlainObject(candidate)) {
      for (const cn of CONTACTO_NAMES) {
        const inner = readOwnCaseInsensitive(candidate, cn);
        if (inner === undefined) continue;
        if (Array.isArray(inner)) {
          return {
            rows: inner.filter(isPlainObject).map((r) => Object.freeze({ ...r })),
            path: `QueryOut.${key}.${cn}`,
          };
        }
        if (isPlainObject(inner)) {
          return {
            rows: [Object.freeze({ ...inner })],
            path: `QueryOut.${key}.${cn}(single)`,
          };
        }
      }
    }
  }
  return { rows: [], path: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Indica si la respuesta tiene el envelope `QueryOut` con al menos una clave
 * de filas reconocida. Una lista vacía sigue siendo válida si la clave existe.
 */
export function isZetaContactsResponse(data: unknown): boolean {
  const queryOut = readQueryOutRoot(data);
  if (!queryOut) return false;
  for (const key of ROW_ARRAY_KEYS) {
    const candidate = readOwnCaseInsensitive(queryOut, key);
    if (candidate === undefined) continue;
    if (Array.isArray(candidate)) return true;
    if (isPlainObject(candidate)) {
      for (const cn of CONTACTO_NAMES) {
        if (readOwnCaseInsensitive(candidate, cn) !== undefined) return true;
      }
    }
  }
  return false;
}

/**
 * Extrae el array de contactos desde la respuesta Zeta.
 * Prioridad: QueryOut.Response[] → QueryOut.Contactos[] → QueryOut.Contactos.Contacto[].
 */
export function extractZetaContacts(data: unknown): ZetaContact[] {
  if (!isZetaContactsResponse(data)) {
    const summary = summarizeZetaContactsResponseShape(data);
    logZetaError({
      request_id: "contract",
      endpoint: "RESTContactosV3Query",
      empresa_codigo: "unknown",
      code: "zeta_contacts_contract_mismatch",
      message: "Estructura QueryOut no reconocida (ver DIV-003 en KNOWN-DIVERGENCES.md).",
      extra: { ...summary },
    });
    return [];
  }
  const queryOut = readQueryOutRoot(data)!;
  const { rows } = findRowsInQueryOut(queryOut);
  return rows;
}

/** Flags de paginación: `IsLastPage` y `TotalRegistros` al nivel de `QueryOut`. */
export function readZetaContactsQueryOutFlags(data: unknown): {
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
 * Diagnóstico read-only del shape de la respuesta.
 * Emitir siempre antes del parser para trazabilidad sin tocar código ante futuras divergencias.
 */
export function summarizeZetaContactsResponseShape(data: unknown): {
  kind: "zeta_contacts_shape_detected";
  typeof_root: string;
  is_array_root: boolean;
  top_level_keys: string[];
  has_query_out: boolean;
  query_out_keys: string[];
  array_path_detected: string | null;
  rows_detected: number;
  first_item_keys: string[];
  shape_summary: string;
} {
  const root = data;
  const typeof_root = root === null ? "null" : Array.isArray(root) ? "array" : typeof root;
  const is_array_root = Array.isArray(root);
  const top_level_keys = isPlainObject(root) ? Object.keys(root) : [];
  const queryOut = readQueryOutRoot(root);
  const has_query_out = queryOut !== null;
  const query_out_keys = queryOut ? Object.keys(queryOut) : [];

  const { rows, path } = queryOut
    ? findRowsInQueryOut(queryOut)
    : { rows: [], path: null };

  const first_item_keys = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

  const shape_summary = has_query_out
    ? path
      ? `QueryOut{${query_out_keys.join(",")}} → ${path}[${rows.length}]`
      : `QueryOut{${query_out_keys.join(",")}} → sin array reconocido`
    : `no_query_out root=${typeof_root} keys=[${top_level_keys.join(",")}]`;

  return {
    kind: "zeta_contacts_shape_detected",
    typeof_root,
    is_array_root,
    top_level_keys,
    has_query_out,
    query_out_keys,
    array_path_detected: path,
    rows_detected: rows.length,
    first_item_keys,
    shape_summary,
  };
}

// ---------------------------------------------------------------------------
// Helpers privados para flags
// ---------------------------------------------------------------------------

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
