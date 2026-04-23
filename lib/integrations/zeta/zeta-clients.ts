/**
 * Solo lectura: consulta de contactos/clientes vía ZetaSoftware `RESTContactosV3Query`.
 * No persiste ni transforma a modelos internos; devuelve respuesta cruda + extracción best-effort para inspección.
 */

import {
  buildZetaConnectionBlock,
  ZetaConfigurationError,
} from "@/lib/integrations/zeta/zeta-connection";

const DEFAULT_ZETA_BASE = "https://api.zetasoftware.com/rest/APIs";

/** Colección Postman ZetaSoftware: Contactos → RESTContactosV3Query. */
export const ZETA_METHOD_LIST_CONTACTS = "RESTContactosV3Query";

export type FetchZetaClientsOptions = {
  /** Página (string según API Zeta). Default `"1"`. */
  page?: string;
  /** Filtro EsCliente; típico `"S"` para clientes. */
  esCliente?: string;
  search?: string;
};

export type FetchZetaClientsResult = {
  ok: boolean;
  requestUrl: string;
  httpStatus: number | null;
  rawText: string | null;
  parsedJson: unknown | null;
  /** Si el cuerpo no era JSON válido. */
  parseError: string | null;
  errors: string[];
  /** Avisos (p. ej. lista vacía con HTTP OK). */
  warnings: string[];
  /**
   * Filas candidatas extraídas del JSON (primer array “grande” de objetos planos encontrado por recorrido).
   * Solo para contar / sample en diagnóstico; no garantiza el esquema oficial de Zeta.
   */
  extractedRows: unknown[];
  /**
   * Dónde se encontró el array de filas (`QueryOut.Data.Items`, `<root-array>`, `recursive:…`) o null.
   */
  zetaRowsExtractionPath: string | null;
};

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

function resolveDeveloperCredentials(): { codigo: string; clave: string } | null {
  const codigo =
    trimEnv("ZETA_DEVELOPER_CODE") ?? trimEnv("ZETA_DESARROLLADOR_CODIGO");
  const clave =
    trimEnv("ZETA_DEVELOPER_KEY") ?? trimEnv("ZETA_DESARROLLADOR_CLAVE");
  if (codigo && clave) return { codigo, clave };
  return null;
}

function collectConfigErrors(): string[] {
  const errors: string[] = [];
  if (!trimEnv("ZETA_COMPANY_CODE")) errors.push("Falta ZETA_COMPANY_CODE.");
  if (!trimEnv("ZETA_COMPANY_KEY")) errors.push("Falta ZETA_COMPANY_KEY.");
  if (!trimEnv("ZETA_ROLE_CODE")) errors.push("Falta ZETA_ROLE_CODE.");
  const dev = resolveDeveloperCredentials();
  if (!dev) {
    errors.push(
      "Autenticación Zeta: faltan credenciales de desarrollador. Definí ZETA_DEVELOPER_CODE y ZETA_DEVELOPER_KEY (o ZETA_DESARROLLADOR_CODIGO / ZETA_DESARROLLADOR_CLAVE)."
    );
  }
  return errors;
}

function buildQueryBody(
  connection: ReturnType<typeof buildZetaConnectionBlock>,
  opts: { page: string; esCliente: string; search?: string }
) {
  const filters: Record<string, string> = {
    EsCliente: opts.esCliente,
  };
  if (opts.search) filters.Search = opts.search;

  return {
    QueryIn: {
      Connection: connection,
      Data: {
        Page: opts.page,
        Filters: filters,
      },
    },
  };
}

function asRecord(node: unknown): Record<string, unknown> | null {
  if (node === null || node === undefined) return null;
  if (typeof node !== "object" || Array.isArray(node)) return null;
  return node as Record<string, unknown>;
}

/** Resuelve clave con coincidencia exacta o solo por mayúsculas/minúsculas (Zeta suele usar PascalCase). */
function resolveRecordKey(rec: Record<string, unknown>, segment: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(rec, segment)) return segment;
  const want = segment.toLowerCase();
  for (const k of Object.keys(rec)) {
    if (k.toLowerCase() === want) return k;
  }
  return undefined;
}

function readPath(root: unknown, segments: readonly string[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    const key = resolveRecordKey(rec, seg);
    if (key === undefined) return undefined;
    cur = rec[key];
  }
  return cur;
}

function onlyPlainObjects(arr: unknown[]): unknown[] {
  return arr.filter((x) => x !== null && typeof x === "object" && !Array.isArray(x));
}

/**
 * Rutas frecuentes en respuestas Zeta REST / OData-like.
 * Orden: más específicas primero; página 1 y 2 comparten el mismo envelope.
 */
const ZETA_ROW_STRUCTURAL_PATHS: readonly (readonly string[])[] = [
  /** Envelopes tipo REST genérico (`response`, `Response`). */
  ["response", "data", "items"],
  ["Response", "Data", "Items"],
  ["response", "data"],
  ["Response", "Data"],
  ["response", "value"],
  ["Response", "Value"],
  ["response", "results"],
  ["Response", "Results"],
  ["QueryOut", "Data", "Items"],
  ["QueryOut", "Data", "Lista"],
  ["QueryOut", "Data", "Registros"],
  ["QueryOut", "Data", "Contactos"],
  ["QueryOut", "Data", "Rows"],
  ["QueryOut", "Items"],
  ["QueryOut", "Lista"],
  ["QueryOut", "Contactos"],
  ["QueryResult", "Data", "Items"],
  ["QueryResult", "Data", "Lista"],
  ["Data", "Items"],
  ["data", "items"],
  ["Result", "Items"],
  ["Results"],
  ["results"],
  ["Items"],
  ["items"],
  ["value"],
  ["Value"],
];

export type ZetaContactRowsExtraction = {
  rows: unknown[];
  pathUsed: string | null;
};

/**
 * Extrae filas de contacto/cliente del JSON Zeta.
 * 1) Rutas estructurales conocidas.
 * 2) Raíz si ya es un array de objetos.
 * 3) Recorrido: el array con más objetos planos (tolera entradas null / no-objeto entre medias).
 */
export function extractZetaContactRows(parsed: unknown): ZetaContactRowsExtraction {
  if (parsed == null) return { rows: [], pathUsed: null };

  if (Array.isArray(parsed)) {
    const plain = onlyPlainObjects(parsed);
    if (plain.length > 0) return { rows: plain, pathUsed: "<root-array>" };
  }

  for (const segments of ZETA_ROW_STRUCTURAL_PATHS) {
    const at = readPath(parsed, segments);
    if (!Array.isArray(at)) continue;
    const plain = onlyPlainObjects(at);
    if (plain.length > 0) {
      return { rows: plain, pathUsed: segments.join(".") };
    }
  }

  const acc: unknown[][] = [];
  collectPlainObjectRowArrays(parsed, acc);
  acc.sort((a, b) => b.length - a.length);
  const best = acc[0];
  if (best && best.length > 0) {
    return { rows: best, pathUsed: "recursive:longest-plain-object-rows" };
  }
  return { rows: [], pathUsed: null };
}

function collectPlainObjectRowArrays(node: unknown, acc: unknown[][]): void {
  if (Array.isArray(node)) {
    const plain = onlyPlainObjects(node);
    if (plain.length > 0) acc.push(plain);
    for (const x of node) collectPlainObjectRowArrays(x, acc);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectPlainObjectRowArrays(v, acc);
    }
  }
}

/** Compat: delega en {@link extractZetaContactRows}. */
export function extractLikelyContactRows(parsed: unknown): unknown[] {
  return extractZetaContactRows(parsed).rows;
}

/**
 * POST a `RESTContactosV3Query` con bloque `Connection` en el body (patrón Zeta REST).
 * Devuelve texto crudo, JSON parseado si aplica, y filas candidatas para conteo/muestra sin mapear a Supabase.
 */
export async function fetchZetaClients(
  options: FetchZetaClientsOptions = {}
): Promise<FetchZetaClientsResult> {
  const page = (options.page ?? "1").trim() || "1";
  const esCliente = (options.esCliente ?? "S").trim() || "S";
  const search = options.search?.trim();

  const configErrors = collectConfigErrors();
  const baseUrl = (trimEnv("ZETA_API_BASE_URL") ?? DEFAULT_ZETA_BASE).replace(
    /\/+$/,
    ""
  );
  const url = `${baseUrl}/${ZETA_METHOD_LIST_CONTACTS}`;

  if (configErrors.length > 0) {
    return {
      ok: false,
      requestUrl: url,
      httpStatus: null,
      rawText: null,
      parsedJson: null,
      parseError: null,
      errors: configErrors,
      warnings: [],
      extractedRows: [],
      zetaRowsExtractionPath: null,
    };
  }

  const dev = resolveDeveloperCredentials()!;

  let connection: ReturnType<typeof buildZetaConnectionBlock>;
  try {
    connection = buildZetaConnectionBlock(
      { desarrolladorCodigo: dev.codigo, desarrolladorClave: dev.clave },
      {
        empresaCodigo: trimEnv("ZETA_COMPANY_CODE")!,
        empresaClave: trimEnv("ZETA_COMPANY_KEY")!,
        rolCodigo: trimEnv("ZETA_ROLE_CODE")!,
      }
    );
  } catch (err) {
    const msg =
      err instanceof ZetaConfigurationError
        ? err.message
        : "No se pudo armar el bloque Connection para Zeta.";
    return {
      ok: false,
      requestUrl: url,
      httpStatus: null,
      rawText: null,
      parsedJson: null,
      parseError: null,
      errors: [msg],
      warnings: [],
      extractedRows: [],
      zetaRowsExtractionPath: null,
    };
  }

  const timeoutMs = Math.min(
    120_000,
    Math.max(5_000, Number(process.env.ZETA_REQUEST_TIMEOUT_MS) || 30_000)
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(
        buildQueryBody(connection, { page, esCliente, search })
      ),
      signal: controller.signal,
      cache: "no-store",
    });

    const rawText = await res.text();

    let parsedJson: unknown = null;
    let parseError: string | null = null;
    try {
      parsedJson = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      parseError =
        e instanceof Error ? e.message : "Respuesta no es JSON válido.";
      parsedJson = null;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!res.ok) {
      errors.push(
        `Zeta respondió HTTP ${res.status}. Revisá credenciales (developer/company/role) y permisos del rol en Zeta.`
      );
    }

    const extraction =
      parsedJson != null ? extractZetaContactRows(parsedJson) : { rows: [], pathUsed: null };
    const extractedRows = extraction.rows;
    const zetaRowsExtractionPath = extraction.pathUsed;

    console.info("[Zeta clients]", {
      extractedRowCount: extractedRows.length,
      path: zetaRowsExtractionPath,
    });

    if (res.ok && extractedRows.length === 0 && parseError == null) {
      warnings.push(
        `HTTP OK pero no se encontró ningún array de objetos en la respuesta (ruta JSON usada: ${zetaRowsExtractionPath ?? "ninguna"}; filas: 0). Puede ser lista vacía o envelope distinto; revisá rawText / parsedJson en el resultado del cliente.`
      );
    }

    if (parseError) {
      warnings.push(
        `No se pudo parsear JSON: ${parseError}. Revisá rawText (puede ser HTML de error o texto plano).`
      );
    }

    return {
      ok: res.ok && errors.length === 0,
      requestUrl: url,
      httpStatus: res.status,
      rawText,
      parsedJson,
      parseError,
      errors,
      warnings,
      extractedRows,
      zetaRowsExtractionPath,
    };
  } catch (e) {
    const message =
      e instanceof Error
        ? e.name === "AbortError"
          ? `Timeout después de ${timeoutMs} ms al llamar a Zeta.`
          : e.message
        : "Error desconocido al llamar a Zeta.";
    console.error("[Zeta clients] fetch error", { url, message });
    return {
      ok: false,
      requestUrl: url,
      httpStatus: null,
      rawText: null,
      parsedJson: null,
      parseError: null,
      errors: [message],
      warnings: [],
      extractedRows: [],
      zetaRowsExtractionPath: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
