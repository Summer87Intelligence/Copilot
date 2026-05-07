/**
 * Fetch read-only — ventas detalladas por periodo (RESTFacturaClienteV4VentasDetalladas).
 * Devuelve filas a nivel de linea; el pipeline de enrichment las agrega por factura.
 *
 * @see docs/vendors/z/invoices.md — seccion RESTFacturaClienteV4VentasDetalladas
 */

import { buildZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection";
import { resolveInvokePack } from "@/lib/integrations/zeta/zeta-invoke-resolve-pack";
import { zetaPostJson, type ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";

export const ZETA_VENTAS_DETALLADAS_METHOD = "RESTFacturaClienteV4VentasDetalladas";

export type VentasDetalladasRow = Readonly<Record<string, unknown>>;

export type FetchVentasDetalladasOk = {
  ok: true;
  rows: VentasDetalladasRow[];
  httpStatus: number;
  raw: unknown;
};

export type FetchVentasDetalladasErr = {
  ok: false;
  rows: [];
  error: string;
  error_code: "zeta_config" | "zeta_http" | "zeta_shape" | "zeta_unknown";
  httpStatus: number | null;
  raw: unknown | null;
};

export type FetchVentasDetalladasResult = FetchVentasDetalladasOk | FetchVentasDetalladasErr;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Busca el primer valor que sea array dentro de obj.
 * Prioriza claves semanticas conocidas; si no, acepta cualquier array presente.
 */
function firstArrayIn(obj: Record<string, unknown>): unknown[] | null {
  const preferred = [
    "ListaMovimientos", "listaMovimientos",
    "ListaDetallada",   "listaDetallada",
    "ListaVentas",      "listaVentas",
    "Items",            "items",
    "Detalle",          "detalle",
    "Rows",             "rows",
    "Data",             "data",
    "Ventas",           "ventas",
    "VentasDetalladas", "ventasDetalladas",
    "Response",         "response",
    "Result",           "result",
    "Lista",            "lista",
  ];
  for (const k of preferred) {
    if (Array.isArray(obj[k])) return obj[k] as unknown[];
  }
  for (const k of Object.keys(obj)) {
    if (Array.isArray(obj[k])) return obj[k] as unknown[];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Logging diagnostico — nunca lanza excepciones
// ---------------------------------------------------------------------------

/**
 * Emite un log estructurado con la forma exacta del raw response.
 * Expone hasta 2 niveles de profundidad + primeras 3 filas si hay array.
 * Seguro: el response de Zeta no contiene credenciales.
 */
function logShapeDiagnostic(
  raw: unknown,
  requestId: string,
  httpStatus: number,
  detectedShape: string,
  rowsDetected: number
): void {
  try {
    let shapeSummary: unknown;

    if (Array.isArray(raw)) {
      shapeSummary = {
        root: "array",
        length: raw.length,
        first3: raw.slice(0, 3),
      };
    } else if (isPlainObject(raw)) {
      const topKeys = Object.keys(raw);
      const expanded: Record<string, unknown> = {};
      for (const k of topKeys.slice(0, 15)) {
        const v = raw[k];
        if (Array.isArray(v)) {
          expanded[k] = { _type: "array", _len: v.length, _first3: (v as unknown[]).slice(0, 3) };
        } else if (isPlainObject(v)) {
          const innerKeys = Object.keys(v);
          const inner: Record<string, unknown> = {};
          for (const ik of innerKeys.slice(0, 15)) {
            const iv = v[ik];
            if (Array.isArray(iv)) {
              inner[ik] = { _type: "array", _len: iv.length, _first3: (iv as unknown[]).slice(0, 3) };
            } else if (isPlainObject(iv)) {
              inner[ik] = { _type: "object", _keys: Object.keys(iv).slice(0, 20) };
            } else {
              inner[ik] = iv;
            }
          }
          expanded[k] = inner;
        } else {
          expanded[k] = v;
        }
      }
      shapeSummary = { root: "object", top_level_keys: topKeys, expanded };
    } else {
      shapeSummary = { root: typeof raw, preview: String(raw).slice(0, 300) };
    }

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta_ventas_detalladas",
        kind: "ventas_detalladas_shape_detected",
        request_id: requestId,
        http_status: httpStatus,
        detected_shape: detectedShape,
        rows_detected: rowsDetected,
        shape_summary: shapeSummary,
      })
    );
  } catch {
    // silencioso: el diagnostico nunca debe romper el flujo
  }
}

// ---------------------------------------------------------------------------
// Parser de shapes
// ---------------------------------------------------------------------------

type ExtractResult = { rows: VentasDetalladasRow[]; shape: string };

/**
 * Extrae el array de filas desde cualquier envelope conocido o desconocido de Zeta.
 *
 * Orden de busqueda:
 * 1. Array en raiz
 * 2. VentasDetalladasOut / QueryOut → Succeed check → Response o Data como array
 * 3. VentasDetalladasOut / QueryOut → Response o Data como objeto → busqueda exhaustiva de array interno
 * 4. VentasDetalladasOut / QueryOut → array directamente bajo el wrapper
 * 5. VentasDetalladasOut / QueryOut → cualquier clave que sea array (fallback por tenant)
 * 6. Cualquier clave del root que sea array (ultimo recurso)
 */
function extractVentasRowsInternal(raw: unknown): ExtractResult | null {
  // 1. Array en raiz
  if (Array.isArray(raw)) {
    return { rows: raw.filter(isPlainObject), shape: "root_array" };
  }

  if (!isPlainObject(raw)) return null;

  // 2-5. Wrappers conocidos
  const outerKeys = [
    "VentasDetalladasOut", "ventasDetalladasOut",
    "QueryOut",            "queryOut",
    "RESTFacturaClienteV4VentasDetalladas",
  ];

  for (const outerKey of outerKeys) {
    const top = raw[outerKey];
    if (top === undefined || top === null) continue;

    // 2a. El wrapper mismo es un array
    if (Array.isArray(top)) {
      return { rows: top.filter(isPlainObject), shape: `${outerKey}:direct_array` };
    }

    if (!isPlainObject(top)) continue;

    const succeed = top.Succeed ?? top.succeed;
    if (succeed === false || succeed === "N" || succeed === 0) return null;

    // 2b. Response / Data como contenedor inmediato
    const containers = [
      { key: "Response",  val: top.Response  ?? top.response },
      { key: "Data",      val: top.Data      ?? top.data     },
      { key: "Result",    val: top.Result     ?? top.result   },
    ];

    for (const { key: containerKey, val: container } of containers) {
      if (container === undefined || container === null) continue;

      // Contenedor es array directo
      if (Array.isArray(container)) {
        return {
          rows: container.filter(isPlainObject),
          shape: `${outerKey}.${containerKey}:array`,
        };
      }

      // Contenedor es objeto → busqueda de array interno
      if (isPlainObject(container)) {
        const arr = firstArrayIn(container);
        if (arr !== null) {
          // Detectar que clave encontro
          const foundKey = Object.keys(container).find((k) => container[k] === arr) ?? "unknown";
          return {
            rows: arr.filter(isPlainObject),
            shape: `${outerKey}.${containerKey}.${foundKey}:array`,
          };
        }
        // Contenedor objeto sin arrays internos conocidos → intentar como item unico
        // (caso raro: Response es el registro, no una lista)
      }
    }

    // 2c. Arrays directamente bajo el wrapper (sin Response ni Data)
    const arr = firstArrayIn(top);
    if (arr !== null) {
      const foundKey = Object.keys(top).find((k) => top[k] === arr) ?? "unknown";
      return {
        rows: arr.filter(isPlainObject),
        shape: `${outerKey}.${foundKey}:array`,
      };
    }
  }

  // 6. Ultimo recurso: cualquier array en el root (excepto arrays vacios)
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (Array.isArray(v) && v.length > 0) {
      return {
        rows: (v as unknown[]).filter(isPlainObject),
        shape: `root.${k}:array_fallback`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Funcion publica
// ---------------------------------------------------------------------------

export async function fetchZetaVentasDetalladas(
  ctx: ZetaCallContext,
  filters: { mes: string; anio: string }
): Promise<FetchVentasDetalladasResult> {
  const resolved = resolveInvokePack();
  if (!resolved.ok) {
    return {
      ok: false,
      rows: [],
      error: resolved.errors.join(" | "),
      error_code: "zeta_config",
      httpStatus: null,
      raw: null,
    };
  }

  const { credentials, config } = resolved.pack;
  const connection = buildZetaConnectionBlock(
    { desarrolladorCodigo: credentials.desarrolladorCodigo, desarrolladorClave: credentials.desarrolladorClave },
    { empresaCodigo: credentials.empresaCodigo, empresaClave: credentials.empresaClave, rolCodigo: credentials.rolCodigo }
  );

  const body = {
    VentasDetalladasIn: {
      Connection: connection,
      Data: {
        Mes: filters.mes.trim().padStart(2, "0"),
        Anio: filters.anio.trim(),
      },
    },
  };

  try {
    const res = await zetaPostJson(ctx, {
      baseUrl: config.baseUrl,
      methodName: ZETA_VENTAS_DETALLADAS_METHOD,
      body,
      timeoutMs: config.timeoutMs,
      maxRetries: Math.min(1, config.maxRetries),
    });

    if (!res.status || res.status < 200 || res.status >= 300) {
      logShapeDiagnostic(res.json, ctx.requestId, res.status ?? 0, "http_error", 0);
      return {
        ok: false,
        rows: [],
        error: `Zeta HTTP ${res.status} en VentasDetalladas`,
        error_code: "zeta_http",
        httpStatus: res.status,
        raw: res.json,
      };
    }

    const result = extractVentasRowsInternal(res.json);

    // Siempre loggear el shape — sea exitoso o no
    logShapeDiagnostic(
      res.json,
      ctx.requestId,
      res.status,
      result?.shape ?? "unrecognized",
      result?.rows.length ?? 0
    );

    if (result === null) {
      return {
        ok: false,
        rows: [],
        error: "Shape de respuesta VentasDetalladas no reconocida; ver log kind:ventas_detalladas_shape_detected",
        error_code: "zeta_shape",
        httpStatus: res.status,
        raw: res.json,
      };
    }

    return { ok: true, rows: result.rows, httpStatus: res.status, raw: res.json };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      error: err instanceof Error ? err.message : String(err),
      error_code: "zeta_unknown",
      httpStatus: null,
      raw: null,
    };
  }
}
