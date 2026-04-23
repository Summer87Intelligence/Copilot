/**
 * Contrato estricto RESTContactosV3Query: solo `QueryOut → Contactos → Contacto[]`.
 * Sin heurísticas ni recorrido genérico de arrays.
 */

import { logZetaError } from "@/lib/integrations/zeta/zeta-logger";

/** Fila cruda tal como viene bajo `Contacto` (campos Zeta en PascalCase u otros). */
export type ZetaContact = Readonly<Record<string, unknown>>;

const QUERY_OUT_NAMES = ["QueryOut", "queryOut"] as const;
const CONTACTOS_NAMES = ["Contactos", "contactos"] as const;
const CONTACTO_NAMES = ["Contacto", "contacto"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Lee una propiedad propia del objeto probando el nombre canónico y variante solo por mayúsculas/minúsculas.
 * No usa `Object.values`.
 */
function readOwnCaseInsensitive(
  rec: Record<string, unknown>,
  canonicalName: string
): unknown {
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

function hasContactosKey(queryOut: Record<string, unknown>): boolean {
  for (const name of CONTACTOS_NAMES) {
    if (readOwnCaseInsensitive(queryOut, name) !== undefined) return true;
  }
  return false;
}

function normalizeContactoList(contactosNode: unknown): ZetaContact[] {
  if (Array.isArray(contactosNode)) {
    return contactosNode.filter(isPlainObject).map((r) => Object.freeze({ ...r }));
  }
  if (!isPlainObject(contactosNode)) return [];
  for (const name of CONTACTO_NAMES) {
    const raw = readOwnCaseInsensitive(contactosNode, name);
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      return raw.filter(isPlainObject).map((r) => Object.freeze({ ...r }));
    }
    if (isPlainObject(raw)) {
      return [Object.freeze({ ...raw })];
    }
    return [];
  }
  return [];
}

/**
 * Indica si la raíz JSON expone el envelope esperado (QueryOut con nodo Contactos).
 * Una lista vacía de contactos sigue siendo válida si la estructura existe.
 */
export function isZetaContactsResponse(data: unknown): boolean {
  const queryOut = readQueryOutRoot(data);
  if (!queryOut) return false;
  if (!hasContactosKey(queryOut)) return false;
  for (const name of CONTACTOS_NAMES) {
    const contactos = readOwnCaseInsensitive(queryOut, name);
    if (contactos === undefined) continue;
    if (Array.isArray(contactos)) return true;
    if (isPlainObject(contactos)) {
      for (const cn of CONTACTO_NAMES) {
        if (readOwnCaseInsensitive(contactos, cn) !== undefined) return true;
      }
    }
    return false;
  }
  return false;
}

function logContractMismatch(data: unknown, reason: string, detail: Record<string, unknown>) {
  logZetaError({
    request_id: "contract",
    endpoint: "RESTContactosV3Query",
    empresa_codigo: "unknown",
    code: "zeta_contacts_contract_mismatch",
    message: reason,
    extra: {
      contract: "QueryOut.Contactos.Contacto",
      ...detail,
      root_type: data === null ? "null" : Array.isArray(data) ? "array" : typeof data,
    },
  });
}

/**
 * Extrae contactos solo desde `QueryOut.Contactos` (array de contactos o objeto con `Contacto`).
 */
export function extractZetaContacts(data: unknown): ZetaContact[] {
  if (!isZetaContactsResponse(data)) {
    logContractMismatch(data, "Estructura QueryOut.Contactos no reconocida.", {
      has_query_out: readQueryOutRoot(data) != null,
    });
    return [];
  }
  const queryOut = readQueryOutRoot(data)!;
  for (const name of CONTACTOS_NAMES) {
    const contactos = readOwnCaseInsensitive(queryOut, name);
    if (contactos === undefined) continue;
    const list = normalizeContactoList(contactos);
    return list;
  }
  logContractMismatch(data, "Contactos presente pero no legible.", {});
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

/** Flags opcionales de paginación en el mismo `QueryOut` (sin heurística fuera de claves conocidas). */
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
