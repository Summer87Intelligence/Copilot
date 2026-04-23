/**
 * Fetch datos comerciales de cliente Zeta (Query) vía `zetaInvokeConnectionAndData`.
 *
 * @see lib/integrations/zeta/zeta-commercial-client-rest-method.ts — nombre REST configurable.
 */

import {
  extractZetaCommercialClientData,
  isZetaCommercialClientQueryResponse,
  readZetaCommercialClientQueryOutFlags,
  type ZetaCommercialClientRecord,
} from "@/lib/integrations/zeta/contracts/zeta-commercial-data-client.contract";
import { buildZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection";
import { resolveZetaCommercialClientRestMethod } from "@/lib/integrations/zeta/zeta-commercial-client-rest-method";
import { zetaInvokeConnectionAndData } from "@/lib/integrations/zeta/zeta-invoke";
import { resolveInvokePack } from "@/lib/integrations/zeta/zeta-invoke-resolve-pack";
import { ZetaHttpError, type ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { logZetaError, logZetaRequest, logZetaResponse } from "@/lib/integrations/zeta/zeta-logger";

export type { ZetaCommercialClientRecord };

export type ZetaCommercialDataClientQueryFilters = {
  codigoDesde?: string;
  codigoHasta?: string;
  nombreContiene?: string;
  rut?: string;
  fechaRegistroDesde?: string;
  fechaRegistroHasta?: string;
};

export type FetchZetaCommercialDataClientParams = {
  ctx: ZetaCallContext;
  page: string;
  filters?: ZetaCommercialDataClientQueryFilters;
};

export type FetchZetaCommercialDataClientOk = {
  ok: true;
  rows: ZetaCommercialClientRecord[];
  total?: number;
  hasMore: boolean;
  requestUrl: string;
  httpStatus: number;
  raw: unknown;
  warnings: string[];
  zeta_method: string;
};

export type FetchZetaCommercialDataClientErr = {
  ok: false;
  rows: [];
  errors: string[];
  warnings: string[];
  error_code: "zeta_config" | "zeta_http" | "zeta_shape" | "zeta_timeout" | "zeta_rate_limit" | "zeta_unknown";
  requestUrl: string;
  httpStatus: number | null;
  raw: unknown | null;
  zeta_method: string;
};

export type FetchZetaCommercialDataClientResult = FetchZetaCommercialDataClientOk | FetchZetaCommercialDataClientErr;

function buildFiltersRecord(f: ZetaCommercialDataClientQueryFilters | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!f) return out;
  if (f.codigoDesde) out.CodigoDesde = f.codigoDesde;
  if (f.codigoHasta) out.CodigoHasta = f.codigoHasta;
  if (f.nombreContiene) out.NombreContiene = f.nombreContiene;
  if (f.rut) out.RUT = f.rut;
  if (f.fechaRegistroDesde) out.FechaRegistroDesde = f.fechaRegistroDesde;
  if (f.fechaRegistroHasta) out.FechaRegistroHasta = f.fechaRegistroHasta;
  return out;
}

function buildQueryInData(page: string, filters: ZetaCommercialDataClientQueryFilters | undefined): Record<string, unknown> {
  const filtersRecord = buildFiltersRecord(filters);
  return {
    Page: page,
    Filters: filtersRecord,
  };
}

function classifyErr(err: unknown): FetchZetaCommercialDataClientErr["error_code"] {
  if (err instanceof ZetaHttpError) {
    if (err.httpStatus === 429) return "zeta_rate_limit";
    if (err.httpStatus === 401 || err.httpStatus === 403) return "zeta_http";
    return "zeta_http";
  }
  if (err instanceof Error && err.name === "AbortError") return "zeta_timeout";
  return "zeta_unknown";
}

function errMessage(err: unknown): string {
  if (err instanceof ZetaHttpError) return `${err.message} (${err.code})`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function fetchZetaCommercialDataClient(
  params: FetchZetaCommercialDataClientParams
): Promise<FetchZetaCommercialDataClientResult> {
  const zeta_method = resolveZetaCommercialClientRestMethod();
  const page = (params.page ?? "1").trim() || "1";
  const resolved = resolveInvokePack();
  const baseUrl = resolved.ok ? resolved.pack.config.baseUrl.replace(/\/+$/, "") : "";
  const url = `${baseUrl}/${zeta_method}`;

  if (!resolved.ok) {
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
    };
  }

  const { credentials, config } = resolved.pack;
  const empresaCodigo = credentials.empresaCodigo;
  const data = buildQueryInData(page, params.filters);

  const bodyBytes = Buffer.byteLength(
    JSON.stringify({
      QueryIn: {
        Connection: buildZetaConnectionBlock(
          {
            desarrolladorCodigo: credentials.desarrolladorCodigo,
            desarrolladorClave: credentials.desarrolladorClave,
          },
          {
            empresaCodigo: credentials.empresaCodigo,
            empresaClave: credentials.empresaClave,
            rolCodigo: credentials.rolCodigo,
          }
        ),
        Data: data,
      },
    }),
    "utf8"
  );

  logZetaRequest({
    request_id: params.ctx.requestId,
    endpoint: zeta_method,
    empresa_codigo: empresaCodigo,
    tenant_id: params.ctx.tenantId,
    sync_run_id: params.ctx.syncRunId,
    payload_size_bytes: bodyBytes,
  });

  const started = Date.now();
  try {
    const res = await zetaInvokeConnectionAndData(params.ctx, {
      methodName: zeta_method,
      rootInKey: "QueryIn",
      data,
      credentials,
      config,
    });
    const duration = Date.now() - started;
    const raw = res.json;
    const responseBytes = Buffer.byteLength(JSON.stringify(raw ?? res.textFallback), "utf8");

    logZetaResponse({
      request_id: params.ctx.requestId,
      endpoint: zeta_method,
      empresa_codigo: empresaCodigo,
      tenant_id: params.ctx.tenantId,
      sync_run_id: params.ctx.syncRunId,
      http_status: res.status,
      duration_ms: duration,
      payload_size_bytes: responseBytes,
    });

    if (!res.status || res.status < 200 || res.status >= 300) {
      const code: FetchZetaCommercialDataClientErr["error_code"] =
        res.status === 429 ? "zeta_rate_limit" : "zeta_http";
      return {
        ok: false,
        rows: [],
        errors: [`Zeta HTTP ${res.status}: respuesta no OK.`],
        warnings: [],
        error_code: code,
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
      };
    }

    const warnings: string[] = [];
    if (!isZetaCommercialClientQueryResponse(raw)) {
      logZetaError({
        request_id: params.ctx.requestId,
        endpoint: zeta_method,
        empresa_codigo: empresaCodigo,
        tenant_id: params.ctx.tenantId,
        sync_run_id: params.ctx.syncRunId,
        code: "zeta_shape",
        message: "HTTP OK pero cuerpo no coincide con QueryOut.Response[] ni array raíz documentado.",
        http_status: res.status,
        duration_ms: duration,
      });
      return {
        ok: false,
        rows: [],
        errors: ["Estructura inesperada: se esperaba QueryOut.Response o array de filas con Codigo."],
        warnings,
        error_code: "zeta_shape",
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
      };
    }

    const rows = extractZetaCommercialClientData(raw);
    const flags = readZetaCommercialClientQueryOutFlags(raw);
    let hasMore: boolean;
    if (flags.isLastPage === true) hasMore = false;
    else if (flags.isLastPage === false) hasMore = true;
    else {
      hasMore = false;
      if (rows.length > 0) {
        warnings.push(
          "Sin IsLastPage en QueryOut; se asume una sola página. Ajustar envase o contrato si hay más de 500 filas."
        );
      }
    }

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
    };
  }
}
