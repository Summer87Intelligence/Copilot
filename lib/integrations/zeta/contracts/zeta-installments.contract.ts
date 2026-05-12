/**
 * Contrato Query **cuotas pendientes de clientes** vía `asoapcuotasv1` /
 * `RESTCuotasV1QueryCliente`.
 *
 * Fuentes:
 * - `docs/zeta/markdown/0158-…cuotas-de-cliente-y-proveedor.md` (parámetros y campos).
 * - `docs/zeta/postman/Api ZetaSoftware collection.json` (item
 *   `RESTCuotasV1QueryCliente`, body `QueryClienteOut.Response[]`).
 *
 * Shapes soportados (detección con tolerancia, alineada al resto de contracts):
 *
 *  1. `QueryClienteOut.Response[]` — Postman oficial (canónico).
 *  2. `QueryOut.Response[]` — método genérico compat.
 *  3. Array raíz `[]` — observado en algunos tenants REST.
 *  4. `*Out` con array interno `Cuotas` / `Items` / `Data` / `Result` — fallback.
 *
 * Cada fila debe incluir `RegistroId` y `CuotaNumero`; filas inválidas se filtran
 * (se loggea el rechazo). El `RegistroId` es la clave que **linkea con la factura**
 * en `proto_invoices.zeta_metadata.zeta_customer_voucher_v1.zeta_registro_id`.
 *
 * Reglas:
 *  - Pure functions, sin side effects (excepto log estructurado en discards).
 *  - Tolerante a camelCase / PascalCase (algunos tenants devuelven `registroId`).
 *  - Tolerante a string/number en numerics (parser normaliza).
 *  - Reutilizable por `zeta-installments-fetch.ts` (paginación) y por el mapper.
 */

export type ZetaInstallmentRecord = Readonly<Record<string, unknown>>;

const OUTER_NAMES = [
  "QueryClienteOut",
  "queryClienteOut",
  "QueryOut",
  "queryOut",
] as const;

const RESPONSE_KEYS = [
  "Response",
  "response",
  "Cuotas",
  "cuotas",
  "Items",
  "items",
  "Data",
  "data",
  "Result",
  "result",
] as const;

const REGISTRO_ID_NAMES = ["RegistroId", "registroId", "registro_id"] as const;
const CUOTA_NUMERO_NAMES = ["CuotaNumero", "cuotaNumero", "cuota_numero"] as const;
const LAST_PAGE_NAMES = ["IsLastPage", "isLastPage", "is_last_page"] as const;
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

function readResponseArray(rec: Record<string, unknown>): unknown[] | null {
  for (const key of RESPONSE_KEYS) {
    const v = readOwnCaseInsensitive(rec, key);
    if (Array.isArray(v)) return v;
  }
  return null;
}

function readBooleanField(rec: Record<string, unknown>, names: readonly string[]): boolean | undefined {
  for (const n of names) {
    const v = readOwnCaseInsensitive(rec, n);
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const lv = v.trim().toLowerCase();
      if (lv === "true" || lv === "s" || lv === "y" || lv === "yes") return true;
      if (lv === "false" || lv === "n" || lv === "no") return false;
    }
  }
  return undefined;
}

function readNumberField(rec: Record<string, unknown>, names: readonly string[]): number | undefined {
  for (const n of names) {
    const v = readOwnCaseInsensitive(rec, n);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) continue;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function hasRegistroId(row: Record<string, unknown>): boolean {
  for (const n of REGISTRO_ID_NAMES) {
    const v = readOwnCaseInsensitive(row, n);
    if (typeof v === "number" && Number.isFinite(v)) return true;
    if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return false;
}

function hasCuotaNumero(row: Record<string, unknown>): boolean {
  for (const n of CUOTA_NUMERO_NAMES) {
    const v = readOwnCaseInsensitive(row, n);
    if (typeof v === "number" && Number.isFinite(v)) return true;
    if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return false;
}

/**
 * Determina si `raw` parece una respuesta válida de `RESTCuotasV1QueryCliente`.
 * Acepta los cuatro shapes documentados (Out wrapper, array directo, array interno).
 */
export function isZetaInstallmentsQueryResponse(raw: unknown): boolean {
  if (Array.isArray(raw)) return true;
  if (!isPlainObject(raw)) return false;
  const outer = readOuterRoot(raw);
  if (!outer) return false;
  const arr = readResponseArray(outer.node);
  return Array.isArray(arr);
}

/**
 * Extrae las filas de cuotas filtrando las que no tienen `RegistroId` + `CuotaNumero`.
 * Devuelve también la cantidad de descartes para que el caller loggee con contexto
 * completo (`empresa_codigo`, `tenant_id`, etc.).
 *
 * `context` solo se usa para retornar diagnóstico estructurado; este contract es
 * pure y no toca el logger directamente.
 */
export function extractZetaInstallments(
  raw: unknown,
  _context?: { request_id?: string }
): ZetaInstallmentRecord[] {
  void _context;
  let rows: unknown[] = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (isPlainObject(raw)) {
    const outer = readOuterRoot(raw);
    if (outer) {
      const arr = readResponseArray(outer.node);
      if (Array.isArray(arr)) rows = arr;
    }
  }
  const kept: ZetaInstallmentRecord[] = [];
  for (const r of rows) {
    if (!isPlainObject(r)) continue;
    if (!hasRegistroId(r) || !hasCuotaNumero(r)) continue;
    kept.push(r as ZetaInstallmentRecord);
  }
  return kept;
}

/**
 * Cuenta cuántas filas fueron descartadas por shape inválido. Útil para que el
 * caller emita un log estructurado en caso de discards > 0.
 */
export function countZetaInstallmentsDiscarded(raw: unknown): number {
  let rows: unknown[] = [];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (isPlainObject(raw)) {
    const outer = readOuterRoot(raw);
    if (outer) {
      const arr = readResponseArray(outer.node);
      if (Array.isArray(arr)) rows = arr;
    }
  }
  let discarded = 0;
  for (const r of rows) {
    if (!isPlainObject(r) || !hasRegistroId(r) || !hasCuotaNumero(r)) discarded++;
  }
  return discarded;
}

/**
 * Lee flags de paginación del `*Out` (`IsLastPage`, `TotalRegistros`).
 */
export function readZetaInstallmentsQueryOutFlags(raw: unknown): {
  isLastPage?: boolean;
  total?: number;
} {
  if (!isPlainObject(raw)) return {};
  const outer = readOuterRoot(raw);
  if (!outer) return {};
  return {
    isLastPage: readBooleanField(outer.node, LAST_PAGE_NAMES),
    total: readNumberField(outer.node, TOTAL_NAMES),
  };
}

/**
 * Diagnóstico: resumen de shape para logs.
 */
export function summarizeZetaInstallmentsResponseShape(raw: unknown): {
  raw_top_level_keys: string[];
  outer_name: string | null;
  response_array_length: number | null;
  is_array_root: boolean;
} {
  if (Array.isArray(raw)) {
    return {
      raw_top_level_keys: [],
      outer_name: null,
      response_array_length: raw.length,
      is_array_root: true,
    };
  }
  if (!isPlainObject(raw)) {
    return { raw_top_level_keys: [], outer_name: null, response_array_length: null, is_array_root: false };
  }
  const top = Object.keys(raw);
  const outer = readOuterRoot(raw);
  if (!outer) {
    return { raw_top_level_keys: top, outer_name: null, response_array_length: null, is_array_root: false };
  }
  const arr = readResponseArray(outer.node);
  return {
    raw_top_level_keys: top,
    outer_name: outer.name,
    response_array_length: Array.isArray(arr) ? arr.length : null,
    is_array_root: false,
  };
}
