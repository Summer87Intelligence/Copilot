/**
 * Fetch solo lectura — recibos de pago a proveedores vía
 * `RESTRecibosPagosV1QueryComprobantes`.
 */

import {
  extractZetaVendorPayments,
  isZetaVendorPaymentsQueryResponse,
  readIsLastPageFromVendorPaymentRows,
  readZetaVendorPaymentsQueryOutFlags,
  summarizeZetaVendorPaymentsResponseShape,
  type ZetaVendorPaymentRecord,
} from "@/lib/integrations/zeta/contracts/zeta-vendor-payments.contract";
import { buildZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection";
import type { ZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection-types";
import { ZetaHttpError, type ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { zetaInvokeConnectionAndData } from "@/lib/integrations/zeta/zeta-invoke";
import { resolveInvokePack } from "@/lib/integrations/zeta/zeta-invoke-resolve-pack";
import { logZetaError, logZetaRequest, logZetaResponse } from "@/lib/integrations/zeta/zeta-logger";
import {
  resolveZetaVendorPaymentsRestMethod,
  resolveZetaVendorPaymentsRootInKey,
} from "@/lib/integrations/zeta/zeta-vendor-payments-rest-method";

export type { ZetaVendorPaymentRecord };

export type ZetaVendorPaymentsQueryFilters = {
  mes: string;
  anio: string;
  proveedorCodigo?: string;
  comprobanteCodigo?: string;
  monedaCodigo?: string;
  localCodigo?: string;
};

export type FetchZetaVendorPaymentsParams = {
  ctx: ZetaCallContext;
  page?: string;
  filters: ZetaVendorPaymentsQueryFilters;
};

export type FetchZetaVendorPaymentsOk = {
  ok: true;
  rows: ZetaVendorPaymentRecord[];
  total?: number;
  hasMore: boolean;
  requestUrl: string;
  httpStatus: number;
  raw: unknown;
  warnings: string[];
  zeta_method: string;
};

export type FetchZetaVendorPaymentsErr = {
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

export type FetchZetaVendorPaymentsResult = FetchZetaVendorPaymentsOk | FetchZetaVendorPaymentsErr;

export function buildQueryInData(
  page: string,
  filters: ZetaVendorPaymentsQueryFilters
): { Page: string; Filters: Record<string, string> } {
  const filtersOut: Record<string, string> = {
    Anio: filters.anio.trim(),
    Mes: stripLeadingZeros(filters.mes.trim()),
  };

  const proveedor = filters.proveedorCodigo?.trim();
  if (proveedor) filtersOut.ProveedorCodigo = proveedor;
  const comprobante = filters.comprobanteCodigo?.trim();
  if (comprobante) filtersOut.ComprobanteCodigo = comprobante;
  const moneda = filters.monedaCodigo?.trim();
  if (moneda) filtersOut.MonedaCodigo = moneda;
  const local = filters.localCodigo?.trim();
  if (local) filtersOut.LocalCodigo = local;

  return {
    Page: page,
    Filters: filtersOut,
  };
}

function stripLeadingZeros(value: string): string {
  if (value === "") return value;
  const replaced = value.replace(/^0+(?=\d)/, "");
  return replaced === "" ? value : replaced;
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

function classifyErr(err: unknown): FetchZetaVendorPaymentsErr["error_code"] {
  if (err instanceof ZetaHttpError) {
    if (err.httpStatus === 429) return "zeta_rate_limit";
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
  rows: ZetaVendorPaymentRecord[],
  warnings: string[]
): boolean {
  const flags = readZetaVendorPaymentsQueryOutFlags(raw);
  if (flags.isLastPage === true) return false;
  if (flags.isLastPage === false) return true;
  const fromRows = readIsLastPageFromVendorPaymentRows(rows);
  if (fromRows === true) return false;
  if (fromRows === false) return true;
  if (rows.length > 0) {
    warnings.push(
      "Sin IsLastPage determinístico en QueryOut ni en la última fila; se asume una sola página."
    );
  }
  return false;
}

export async function fetchZetaVendorPayments(
  params: FetchZetaVendorPaymentsParams
): Promise<FetchZetaVendorPaymentsResult> {
  const zeta_method = resolveZetaVendorPaymentsRestMethod();
  const rootInKey = resolveZetaVendorPaymentsRootInKey();
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

  const payloadForLog: Record<string, unknown> = {
    [rootInKey]: {
      Connection: connection,
      Data: data,
    },
  };
  const bodyBytes = Buffer.byteLength(JSON.stringify(payloadForLog), "utf8");

  logZetaRequest({
    request_id: params.ctx.requestId,
    endpoint: zeta_method,
    empresa_codigo: empresaCodigo,
    tenant_id: params.ctx.tenantId,
    sync_run_id: params.ctx.syncRunId,
    payload_size_bytes: bodyBytes,
  });

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "zeta_vendor_payments_fetch",
      kind: "zeta_vendor_payments_payload_shape",
      request_id: params.ctx.requestId,
      sync_run_id: params.ctx.syncRunId ?? null,
      tenant_id: params.ctx.tenantId ?? null,
      zeta_method,
      root_in_key: rootInKey,
      payload_preview: {
        [rootInKey]: {
          Connection: redactConnectionForLog(connection),
          Data: data,
        },
      },
    })
  );

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

    const responseShape = summarizeZetaVendorPaymentsResponseShape(raw);
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta_vendor_payments_fetch",
        kind: "zeta_vendor_payments_raw_response",
        request_id: params.ctx.requestId,
        sync_run_id: params.ctx.syncRunId ?? null,
        tenant_id: params.ctx.tenantId ?? null,
        zeta_method,
        http_status: res.status,
        payload_size_bytes: responseBytes,
        ...responseShape,
      })
    );

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
    if (!isZetaVendorPaymentsQueryResponse(raw)) {
      logZetaError({
        request_id: params.ctx.requestId,
        endpoint: zeta_method,
        empresa_codigo: empresaCodigo,
        tenant_id: params.ctx.tenantId,
        sync_run_id: params.ctx.syncRunId,
        code: "zeta_shape",
        message: "HTTP OK pero cuerpo no coincide con QueryComprobantesOut.Response[] ni array raíz documentado.",
        http_status: res.status,
        duration_ms: duration,
      });
      return {
        ok: false,
        rows: [],
        errors: ["Estructura inesperada: se esperaba QueryComprobantesOut.Response o array de pagos."],
        warnings,
        error_code: "zeta_shape",
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
      };
    }

    const rows = extractZetaVendorPayments(raw);
    const flags = readZetaVendorPaymentsQueryOutFlags(raw);
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
