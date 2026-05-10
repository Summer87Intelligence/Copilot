/**
 * Fetch solo lectura — comprobantes por cliente (Query Zeta).
 * Body `{ QueryIn: { Connection, Data } }` según colección Postman oficial Zeta (`RESTComprobantesClienteV1Query`;
 * negocio en `Data` per ayuda `0156` + credenciales `0082`). Sin `Page` / `Filters` en este flujo.
 * No invoca Save/Delete/Update en Zeta.
 *
 * @see `zeta-customer-vouchers-rest-method.ts`
 * @see `docs/zeta/reference/zeta-postman-examples.md`
 */

import {
  diagnoseZetaCustomerVouchersExtraction,
  extractZetaCustomerVouchers,
  isZetaCustomerVouchersQueryResponse,
  readZetaCustomerVouchersQueryOutFlags,
  summarizeCustomerVouchersUnexpectedShape,
  type ZetaCustomerVoucherRecord,
} from "@/lib/integrations/zeta/contracts/zeta-customer-vouchers.contract";
import { buildZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection";
import type { ZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection-types";
import { resolveZetaCustomerVouchersRestMethod } from "@/lib/integrations/zeta/zeta-customer-vouchers-rest-method";
import { resolveInvokePack } from "@/lib/integrations/zeta/zeta-invoke-resolve-pack";
import { ZetaHttpError, zetaPostJson, type ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { logZetaError, logZetaRequest, logZetaResponse } from "@/lib/integrations/zeta/zeta-logger";

export type { ZetaCustomerVoucherRecord };

/** Filtros alineados a la ayuda Query (Mes/Anio obligatorios en negocio Zeta). */
export type ZetaCustomerVouchersQueryFilters = {
  mes: string;
  anio: string;
  clienteCodigo?: string;
  fechaDesde?: string;
  fechaHasta?: string;
};

export type FetchZetaCustomerVouchersParams = {
  ctx: ZetaCallContext;
  /** Paginación genérica Zeta (si el endpoint la expone); default `"1"`. */
  page?: string;
  filters: ZetaCustomerVouchersQueryFilters;
};

export type FetchZetaCustomerVouchersOk = {
  ok: true;
  rows: ZetaCustomerVoucherRecord[];
  total?: number;
  hasMore: boolean;
  requestUrl: string;
  httpStatus: number;
  raw: unknown;
  warnings: string[];
  zeta_method: string;
  root_in_key: string;
};

export type FetchZetaCustomerVouchersErr = {
  ok: false;
  rows: [];
  errors: string[];
  warnings: string[];
  error_code: "zeta_config" | "zeta_http" | "zeta_shape" | "zeta_timeout" | "zeta_rate_limit" | "zeta_unknown";
  requestUrl: string;
  httpStatus: number | null;
  raw: unknown | null;
  zeta_method: string;
  root_in_key: string;
  details?: Record<string, unknown>;
};

export type FetchZetaCustomerVouchersResult = FetchZetaCustomerVouchersOk | FetchZetaCustomerVouchersErr;

const RESPONSE_PREVIEW_MAX = 12_000;

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function redactConnectionForLog(block: ZetaConnectionBlock): Record<string, string> {
  return {
    DesarrolladorCodigo: block.DesarrolladorCodigo,
    DesarrolladorClave: "[REDACTED]",
    EmpresaCodigo: block.EmpresaCodigo,
    EmpresaClave: "[REDACTED]",
    RolCodigo: block.RolCodigo,
  };
}

function jsonPreview(value: unknown, max = RESPONSE_PREVIEW_MAX): string {
  try {
    const s = JSON.stringify(value, null, 0);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}… (truncado, ${s.length} chars)`;
  } catch {
    return String(value);
  }
}

/**
 * Resume la forma del JSON Zeta antes del contrato (sin heurística de barrido).
 */
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

function summarizeZetaResponseShape(raw: unknown): string {
  if (raw === null) return "null";
  if (Array.isArray(raw)) return `root_array[length=${raw.length}]`;
  if (typeof raw !== "object") return `primitive:${typeof raw}`;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o).slice(0, 24).join(",");
  const hasSvc =
    Object.prototype.hasOwnProperty.call(o, "ComprobantesClienteV1QueryOut") ||
    Object.prototype.hasOwnProperty.call(o, "comprobantesClienteV1QueryOut");
  const hasQ =
    Object.prototype.hasOwnProperty.call(o, "QueryOut") ||
    Object.prototype.hasOwnProperty.call(o, "queryOut");
  if (hasSvc) return `object[ComprobantesClienteV1QueryOut]+keys[${keys}]`;
  if (hasQ) return `object[QueryOut]+keys[${keys}]`;
  return `object[keys=${keys}]`;
}

function readZetaApplicationFault(raw: unknown): string | null {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const svcNames = ["ComprobantesClienteV1QueryOut", "comprobantesClienteV1QueryOut"] as const;
  for (const sn of svcNames) {
    const svc = readOwnCaseInsensitive(o, sn);
    if (!isPlainObject(svc)) continue;
    const succ = svc.Succeed ?? svc.succeed ?? svc.Success ?? svc.success;
    if (succ === false || succ === "false" || succ === 0 || succ === "N" || succ === "n") {
      const errRaw = svc.Error ?? svc.error;
      if (isPlainObject(errRaw)) {
        const code = str((errRaw as Record<string, unknown>).Code ?? (errRaw as Record<string, unknown>).code);
        const msg = str(
          (errRaw as Record<string, unknown>).Message ?? (errRaw as Record<string, unknown>).message
        );
        if (code || msg) return [code, msg].filter(Boolean).join(": ");
      }
      const m = str(svc.Mensaje ?? svc.Message ?? svc.message);
      return m || "ComprobantesClienteV1QueryOut indica fallo sin mensaje";
    }
  }
  const s = o.Succeed ?? o.succeed ?? o.Success ?? o.success;
  if (s === false || s === "false" || s === 0 || s === "N" || s === "n") {
    const topMsg = str(o.Mensaje ?? o.Message ?? o.message ?? o.Error ?? o.error);
    return topMsg || "Succeed/Success=false sin mensaje explícito";
  }
  const qoRaw = o.QueryOut ?? o.queryOut;
  if (qoRaw !== null && qoRaw !== undefined && typeof qoRaw === "object" && !Array.isArray(qoRaw)) {
    const qo = qoRaw as Record<string, unknown>;
    const qs = qo.Success ?? qo.success ?? qo.Succeed ?? qo.succeed;
    if (qs === false || qs === "false" || qs === 0) {
      const m = str(qo.Mensaje ?? qo.Message ?? qo.message);
      return m || "QueryOut indica fallo sin mensaje";
    }
  }
  return null;
}

function validateFilters(filters: ZetaCustomerVouchersQueryFilters): string | null {
  const mes = filters.mes.trim();
  const anio = filters.anio.trim();
  if (!/^\d{1,2}$/.test(mes)) return "Data.Mes inválido (se espera 1-12).";
  if (!/^\d{4}$/.test(anio)) return "Data.Anio inválido (se espera AAAA).";
  const mn = Number(mes);
  if (mn < 1 || mn > 12) return "Data.Mes fuera de rango 1-12.";
  return null;
}

/** `Data` del body (campos de negocio; `Mes`/`Anio` obligatorios ya validados antes del POST). */
function buildCustomerVouchersData(filters: ZetaCustomerVouchersQueryFilters): {
  ClienteCodigo: string;
  Mes: string;
  Anio: string;
  FechaDesde: string;
  FechaHasta: string;
} {
  return {
    ClienteCodigo: filters.clienteCodigo?.trim() ?? "",
    Mes: filters.mes.trim().padStart(2, "0").slice(-2),
    Anio: filters.anio.trim(),
    FechaDesde: filters.fechaDesde?.trim() ?? "",
    FechaHasta: filters.fechaHasta?.trim() ?? "",
  };
}

function classifyErr(err: unknown): FetchZetaCustomerVouchersErr["error_code"] {
  if (err instanceof ZetaHttpError) {
    if (err.httpStatus === 429) return "zeta_rate_limit";
    if (err.httpStatus === 401 || err.httpStatus === 403) return "zeta_http";
    return "zeta_http";
  }
  if (err instanceof Error && err.name === "AbortError") return "zeta_timeout";
  return "zeta_unknown";
}

function errMessage(err: unknown): string {
  if (err instanceof ZetaHttpError) return `${err.message} (${err.code}) body=${err.bodySnippet}`;
  if (err instanceof Error) return `${err.message}${err.stack ? `\n${err.stack}` : ""}`;
  return String(err);
}

function zetaDebugConsole(payload: Record<string, unknown>) {
  console.info(
    `ZETA DEBUG [customer_vouchers]: ${JSON.stringify({ timestamp: new Date().toISOString(), ...payload })}`
  );
}

/**
 * POST Query read-only a Zeta; únicamente transporte + parseo contractual.
 */
/** Raíz JSON enviada a Zeta (patrón REST Postman oficial: `QueryIn`). */
const CUSTOMER_VOUCHERS_ROOT_IN_KEY = "QueryIn";

const CUSTOMER_VOUCHERS_BODY_SHAPE = "queryIn" as const;

export async function fetchZetaCustomerVouchers(
  params: FetchZetaCustomerVouchersParams
): Promise<FetchZetaCustomerVouchersResult> {
  const zeta_method = resolveZetaCustomerVouchersRestMethod();
  const root_in_key = CUSTOMER_VOUCHERS_ROOT_IN_KEY;
  const page = (params.page ?? "1").trim() || "1";
  const resolved = resolveInvokePack();
  const baseUrl = resolved.ok ? resolved.pack.config.baseUrl.replace(/\/+$/, "") : "";
  const url = `${baseUrl}/${zeta_method}`;

  const filterErr = validateFilters(params.filters);
  if (filterErr) {
    logZetaError({
      request_id: params.ctx.requestId,
      endpoint: zeta_method,
      empresa_codigo: "unknown",
      tenant_id: params.ctx.tenantId,
      sync_run_id: params.ctx.syncRunId,
      code: "zeta_validation",
      message: filterErr,
      extra: { body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE, filters: params.filters },
    });
    return {
      ok: false,
      rows: [],
      errors: [filterErr],
      warnings: [],
      error_code: "zeta_config",
      requestUrl: url || zeta_method,
      httpStatus: null,
      raw: null,
      zeta_method,
      root_in_key,
      details: { phase: "validate_filters", body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE, zeta_method },
    };
  }

  if (!resolved.ok) {
    logZetaError({
      request_id: params.ctx.requestId,
      endpoint: zeta_method,
      empresa_codigo: "unknown",
      tenant_id: params.ctx.tenantId,
      sync_run_id: params.ctx.syncRunId,
      code: "zeta_config",
      message: "resolveInvokePack falló",
      extra: { errors: resolved.errors, body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE, zeta_method },
    });
    return {
      ok: false,
      rows: [],
      errors: resolved.errors,
      warnings: [],
      error_code: "zeta_config",
      requestUrl: url || zeta_method,
      httpStatus: null,
      raw: null,
      zeta_method,
      root_in_key,
      details: { phase: "invoke_pack", body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE, zeta_method, errors: resolved.errors },
    };
  }

  const { credentials, config } = resolved.pack;
  const empresaCodigo = credentials.empresaCodigo;
  const connection = buildZetaConnectionBlock(
    {
      desarrolladorCodigo: credentials.desarrolladorCodigo,
      desarrolladorClave: credentials.desarrolladorClave,
    },
    {
      empresaCodigo: credentials.empresaCodigo,
      empresaClave: credentials.empresaClave,
      rolCodigo: credentials.rolCodigo,
    }
  );

  const Data = buildCustomerVouchersData(params.filters);
  const payload = {
    QueryIn: {
      Connection: connection,
      Data,
    },
  };

  const bodyBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");

  logZetaRequest({
    request_id: params.ctx.requestId,
    endpoint: zeta_method,
    empresa_codigo: empresaCodigo,
    tenant_id: params.ctx.tenantId,
    sync_run_id: params.ctx.syncRunId,
    payload_size_bytes: bodyBytes,
    extra: {
      kind: "customer_vouchers_request",
      body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE,
      zeta_method_resolved: zeta_method,
      data: Data,
      connection: redactConnectionForLog(connection),
      requested_page: page,
      note: "QueryIn → Data: ClienteCodigo, Mes, Anio, FechaDesde, FechaHasta (strings; opcionales vacíos). Sin Page/Filters.",
    },
  });

  zetaDebugConsole({
    phase: "pre_invoke",
    method: zeta_method,
    requested_page: page,
    payload: {
      QueryIn: {
        Connection: redactConnectionForLog(connection),
        Data,
      },
    },
  });

  const started = Date.now();
  try {
    const res = await zetaPostJson(params.ctx, {
      baseUrl: config.baseUrl,
      methodName: zeta_method,
      body: payload,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
    const duration = Date.now() - started;
    const raw = res.json;
    const responseBytes = Buffer.byteLength(JSON.stringify(raw ?? res.textFallback), "utf8");
    const shapeSummary = summarizeZetaResponseShape(raw);
    const fault = readZetaApplicationFault(raw);

    logZetaResponse({
      request_id: params.ctx.requestId,
      endpoint: zeta_method,
      empresa_codigo: empresaCodigo,
      tenant_id: params.ctx.tenantId,
      sync_run_id: params.ctx.syncRunId,
      http_status: res.status,
      duration_ms: duration,
      payload_size_bytes: responseBytes,
      extra: {
        kind: "customer_vouchers_response",
        body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE,
        response_shape: shapeSummary,
        response_preview: jsonPreview(raw),
        zeta_fault_message: fault,
        text_fallback_preview:
          typeof res.textFallback === "string" ? res.textFallback.slice(0, 2000) : null,
      },
    });

    zetaDebugConsole({
      phase: "post_http",
      method: zeta_method,
      http_status: res.status,
      response_shape: shapeSummary,
      response: jsonPreview(raw, 4000),
    });

    if (!res.status || res.status < 200 || res.status >= 300) {
      const msg = `Zeta HTTP ${res.status}: respuesta no OK.`;
      logZetaError({
        request_id: params.ctx.requestId,
        endpoint: zeta_method,
        empresa_codigo: empresaCodigo,
        tenant_id: params.ctx.tenantId,
        sync_run_id: params.ctx.syncRunId,
        code: res.status === 429 ? "zeta_rate_limit" : "zeta_http",
        message: msg,
        http_status: res.status,
        duration_ms: duration,
        extra: {
          body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE,
          response_shape: shapeSummary,
          response_preview: jsonPreview(raw, 4000),
          fault,
        },
      });
      return {
        ok: false,
        rows: [],
        errors: [fault ? `${msg} ${fault}` : msg],
        warnings: [],
        error_code: res.status === 429 ? "zeta_rate_limit" : "zeta_http",
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
        root_in_key,
        details: {
          http_status: res.status,
          body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE,
          response_shape: shapeSummary,
          response_preview: jsonPreview(raw, 4000),
          zeta_fault_message: fault,
        },
      };
    }

    if (fault) {
      logZetaError({
        request_id: params.ctx.requestId,
        endpoint: zeta_method,
        empresa_codigo: empresaCodigo,
        tenant_id: params.ctx.tenantId,
        sync_run_id: params.ctx.syncRunId,
        code: "zeta_application_fault",
        message: fault,
        http_status: res.status,
        duration_ms: duration,
        extra: { body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE, response_shape: shapeSummary, response_preview: jsonPreview(raw, 4000) },
      });
      return {
        ok: false,
        rows: [],
        errors: [fault],
        warnings: [],
        error_code: "zeta_shape",
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
        root_in_key,
        details: {
          body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE,
          response_shape: shapeSummary,
          zeta_fault_message: fault,
          response_preview: jsonPreview(raw, 4000),
        },
      };
    }

    const warnings: string[] = [];
    const shapeOk = isZetaCustomerVouchersQueryResponse(raw);
    if (!shapeOk) {
      let rawFail = "";
      try {
        rawFail = JSON.stringify(raw, null, 2);
      } catch (e) {
        rawFail = String(e);
      }
      console.error("UNEXPECTED CUSTOMER VOUCHERS SHAPE");
      console.error("UNEXPECTED shape summary:", JSON.stringify(summarizeCustomerVouchersUnexpectedShape(raw), null, 2));
      console.error("UNEXPECTED raw (preview 24k):", rawFail.length > 24_000 ? `${rawFail.slice(0, 24_000)}…` : rawFail);
      const msg =
        "unexpected Zeta response shape: rutas permitidas ComprobantesClienteV1QueryOut.*, QueryOut.* o array raíz de objetos.";
      logZetaError({
        request_id: params.ctx.requestId,
        endpoint: zeta_method,
        empresa_codigo: empresaCodigo,
        tenant_id: params.ctx.tenantId,
        sync_run_id: params.ctx.syncRunId,
        code: "zeta_shape",
        message: msg,
        http_status: res.status,
        duration_ms: duration,
        extra: {
          body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE,
          response_shape: shapeSummary,
          contract_matched: false,
          response_preview: jsonPreview(raw, RESPONSE_PREVIEW_MAX),
        },
      });
      return {
        ok: false,
        rows: [],
        errors: [msg],
        warnings,
        error_code: "zeta_shape",
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
        root_in_key,
        details: {
          body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE,
          response_shape: shapeSummary,
          contract_matched: false,
          response_preview: jsonPreview(raw, RESPONSE_PREVIEW_MAX),
        },
      };
    }

    const diag = diagnoseZetaCustomerVouchersExtraction(raw);
    const rows = extractZetaCustomerVouchers(raw);
    if (rows.length !== diag.would_extract_row_count) {
      console.warn(
        "EXTRACT length distinto a would_extract_row_count:",
        rows.length,
        "vs",
        diag.would_extract_row_count
      );
    }
    const flags = readZetaCustomerVouchersQueryOutFlags(raw);
    let hasMore: boolean;
    if (flags.isLastPage === true) hasMore = false;
    else if (flags.isLastPage === false) hasMore = true;
    else {
      hasMore = false;
      if (rows.length > 0) {
        warnings.push(
          "Sin IsLastPage en QueryOut; se asume una sola página para este período. Revisar contrato si el volumen supera 500 comprobantes."
        );
      }
    }

    zetaDebugConsole({
      phase: "parsed",
      method: zeta_method,
      parsed_rows: rows.length,
      has_more: hasMore,
      response_shape: shapeSummary,
    });

    return {
      ok: true,
      rows,
      total: flags.total,
      hasMore,
      requestUrl: url,
      httpStatus: res.status,
      raw,
      warnings,
      zeta_method,
      root_in_key,
    };
  } catch (err) {
    const duration = Date.now() - started;
    const ec = classifyErr(err);
    logZetaError({
      request_id: params.ctx.requestId,
      endpoint: zeta_method,
      empresa_codigo: empresaCodigo,
      tenant_id: params.ctx.tenantId,
      sync_run_id: params.ctx.syncRunId,
      code: ec,
      message: errMessage(err),
      duration_ms: duration,
      err,
      extra: { body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE, zeta_method, phase: "invoke_or_parse_exception" },
    });
    return {
      ok: false,
      rows: [],
      errors: [errMessage(err)],
      warnings: [],
      error_code: ec,
      requestUrl: url,
      httpStatus: err instanceof ZetaHttpError ? err.httpStatus : null,
      raw: null,
      zeta_method,
      root_in_key,
      details: {
        body_shape: CUSTOMER_VOUCHERS_BODY_SHAPE,
        exception: err instanceof Error ? err.name : typeof err,
        stack: err instanceof Error ? err.stack : undefined,
      },
    };
  }
}
