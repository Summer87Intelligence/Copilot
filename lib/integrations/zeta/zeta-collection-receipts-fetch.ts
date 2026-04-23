/**
 * Fetch solo lectura — recibos de cobranza listados vía `QueryComprobantes` (`asoapreciboscobranzav2`).
 * Solo `zetaInvokeConnectionAndData` (consulta); no Save / Load / Delete en Zeta.
 *
 * @see `zeta-collection-receipts-rest-method.ts`
 */

import {
  extractZetaCollectionReceipts,
  isZetaCollectionReceiptsQueryResponse,
  readIsLastPageFromReceiptRows,
  readZetaCollectionReceiptsQueryOutFlags,
  type ZetaCollectionReceiptRecord,
} from "@/lib/integrations/zeta/contracts/zeta-collection-receipts.contract";
import { buildZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection";
import {
  resolveZetaCollectionReceiptsRestMethod,
  resolveZetaCollectionReceiptsRootInKey,
} from "@/lib/integrations/zeta/zeta-collection-receipts-rest-method";
import { zetaInvokeConnectionAndData } from "@/lib/integrations/zeta/zeta-invoke";
import { resolveInvokePack } from "@/lib/integrations/zeta/zeta-invoke-resolve-pack";
import { ZetaHttpError, type ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { logZetaError, logZetaRequest, logZetaResponse } from "@/lib/integrations/zeta/zeta-logger";

export type { ZetaCollectionReceiptRecord };

export type ZetaCollectionReceiptsQueryFilters = {
  mes: string;
  anio: string;
  clienteCodigo?: string;
  comprobanteCodigo?: string;
  monedaCodigo?: string;
  localCodigo?: string;
  cobradorCodigo?: string;
};

export type FetchZetaCollectionReceiptsParams = {
  ctx: ZetaCallContext;
  page?: string;
  filters: ZetaCollectionReceiptsQueryFilters;
};

export type FetchZetaCollectionReceiptsOk = {
  ok: true;
  rows: ZetaCollectionReceiptRecord[];
  total?: number;
  hasMore: boolean;
  requestUrl: string;
  httpStatus: number;
  raw: unknown;
  warnings: string[];
  zeta_method: string;
};

export type FetchZetaCollectionReceiptsErr = {
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

export type FetchZetaCollectionReceiptsResult = FetchZetaCollectionReceiptsOk | FetchZetaCollectionReceiptsErr;

function buildQueryInData(page: string, filters: ZetaCollectionReceiptsQueryFilters): Record<string, unknown> {
  const f: Record<string, string> = {
    Anio: filters.anio.trim(),
    Mes: filters.mes.trim().padStart(2, "0").slice(-2),
    ClienteCodigo: filters.clienteCodigo?.trim() ?? "",
    ComprobanteCodigo: filters.comprobanteCodigo?.trim() ?? "",
    MonedaCodigo: filters.monedaCodigo?.trim() ?? "",
    LocalCodigo: filters.localCodigo?.trim() ?? "",
    CobradorCodigo: filters.cobradorCodigo?.trim() ?? "",
  };
  return {
    Page: page,
    Filters: f,
  };
}

function classifyErr(err: unknown): FetchZetaCollectionReceiptsErr["error_code"] {
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

function resolveHasMore(
  raw: unknown,
  rows: ZetaCollectionReceiptRecord[],
  warnings: string[]
): boolean {
  const flags = readZetaCollectionReceiptsQueryOutFlags(raw);
  if (flags.isLastPage === true) return false;
  if (flags.isLastPage === false) return true;
  const fromRows = readIsLastPageFromReceiptRows(rows);
  if (fromRows === true) return false;
  if (fromRows === false) return true;
  if (rows.length > 0) {
    warnings.push(
      "Sin IsLastPage determinístico en QueryOut ni en la última fila; se asume una sola página. Ajustar env o contrato si hay más de una página."
    );
  }
  return false;
}

/**
 * POST Query read-only a Zeta; transporte + validación contractual + paginación (`IsLastPage`).
 */
export async function fetchZetaCollectionReceipts(
  params: FetchZetaCollectionReceiptsParams
): Promise<FetchZetaCollectionReceiptsResult> {
  const zeta_method = resolveZetaCollectionReceiptsRestMethod();
  const rootInKey = resolveZetaCollectionReceiptsRootInKey();
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
      [rootInKey]: {
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
      rootInKey,
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
      return {
        ok: false,
        rows: [],
        errors: [`Zeta HTTP ${res.status}: respuesta no OK.`],
        warnings: [],
        error_code: res.status === 429 ? "zeta_rate_limit" : "zeta_http",
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
      };
    }

    const warnings: string[] = [];
    if (!isZetaCollectionReceiptsQueryResponse(raw)) {
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
        errors: ["Estructura inesperada: se esperaba QueryOut.Response o array de recibos."],
        warnings,
        error_code: "zeta_shape",
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
      };
    }

    const rows = extractZetaCollectionReceipts(raw);
    const flags = readZetaCollectionReceiptsQueryOutFlags(raw);
    const hasMore = resolveHasMore(raw, rows, warnings);

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
