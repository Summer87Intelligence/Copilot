/**
 * Fetch solo lectura — cuotas pendientes de clientes vía `RESTCuotasV1QueryCliente`
 * (`asoapcuotasv1` / Method `QueryCliente`).
 *
 * Solo lectura: no `Save` / `Load` / `Delete` en Zeta. Sigue el mismo patrón que
 * `zeta-collection-receipts-fetch.ts` y `zeta-customer-vouchers-fetch.ts`:
 *
 *   - Resuelve credenciales y config Zeta vía `resolveInvokePack()`.
 *   - Construye `Connection + Data { Page, Filters }` con `zetaInvokeConnectionAndData`.
 *   - Loggea request/response (sin secretos) vía `zeta-logger`.
 *   - Valida shape contra `contracts/zeta-installments.contract`.
 *   - Detecta `IsLastPage` para paginación, con fallback defensivo.
 *
 * El `RegistroId` que devuelve cada fila linkea con la factura del cliente:
 * `proto_invoices.zeta_metadata.zeta_customer_voucher_v1.zeta_registro_id`.
 *
 * Reglas:
 *  - NO escribe en DB (eso lo hará el pipeline futuro).
 *  - Filters opcionales no se envían vacíos (Zeta binder casts `<integer>` y
 *    rechaza con HTTP 400; ver doc en `zeta-collection-receipts-fetch.ts`).
 */

import {
  countZetaInstallmentsDiscarded,
  extractZetaInstallments,
  isZetaInstallmentsQueryResponse,
  readZetaInstallmentsQueryOutFlags,
  summarizeZetaInstallmentsResponseShape,
  type ZetaInstallmentRecord,
} from "@/lib/integrations/zeta/contracts/zeta-installments.contract";
import { buildZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection";
import type { ZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection-types";
import { zetaInvokeConnectionAndData } from "@/lib/integrations/zeta/zeta-invoke";
import { resolveInvokePack } from "@/lib/integrations/zeta/zeta-invoke-resolve-pack";
import { ZetaHttpError, type ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { logZetaError, logZetaRequest, logZetaResponse } from "@/lib/integrations/zeta/zeta-logger";

export type { ZetaInstallmentRecord };

/**
 * Filtros de `RESTCuotasV1QueryCliente`. Todos opcionales excepto el rango de
 * vencimiento y de saldo (que la doc Zeta marca como obligatorios; el wrapper
 * usa default amplio si no se especifican).
 */
export type ZetaInstallmentsQueryFilters = {
  clienteCodigo?: string;
  /** RegistroId de FACTURA — útil para auditar una factura específica. */
  registroId?: string | number;
  /** YYYY-MM-DD. Default '2000-01-01'. */
  cuotaVencimientoDesde?: string;
  /** YYYY-MM-DD. Default '2099-12-31'. */
  cuotaVencimientoHasta?: string;
  /** Numérico Zeta: 1=UYU, 2=USD. */
  monedaCodigo?: string | number;
  /** Default 0. */
  cuotaSaldoDesde?: string | number;
  /** Default 999999999.99999. */
  cuotaSaldoHasta?: string | number;
};

export type FetchZetaInstallmentsParams = {
  ctx: ZetaCallContext;
  /** Página (1-based). Default '1'. */
  page?: string;
  filters: ZetaInstallmentsQueryFilters;
};

export type FetchZetaInstallmentsOk = {
  ok: true;
  rows: ZetaInstallmentRecord[];
  total?: number;
  hasMore: boolean;
  requestUrl: string;
  httpStatus: number;
  raw: unknown;
  warnings: string[];
  zeta_method: string;
};

export type FetchZetaInstallmentsErr = {
  ok: false;
  rows: [];
  errors: string[];
  warnings: string[];
  error_code:
    | "zeta_config"
    | "zeta_http"
    | "zeta_shape"
    | "zeta_timeout"
    | "zeta_rate_limit"
    | "zeta_unknown";
  requestUrl: string;
  httpStatus: number | null;
  raw: unknown | null;
  zeta_method: string;
};

export type FetchZetaInstallmentsResult = FetchZetaInstallmentsOk | FetchZetaInstallmentsErr;

export const ZETA_INSTALLMENTS_METHOD = "RESTCuotasV1QueryCliente";
export const ZETA_INSTALLMENTS_ROOT_IN_KEY = "QueryClienteIn";

const DEFAULT_VENC_DESDE = "2000-01-01";
const DEFAULT_VENC_HASTA = "2099-12-31";
const DEFAULT_SALDO_DESDE = 0;
const DEFAULT_SALDO_HASTA = 999999999.99999;

/**
 * Construye el bloque `Data = { Page, Filters }` para `QueryCliente`.
 *
 * Reglas (alineadas a Postman oficial + analogía con saldos pendientes):
 *  - Solo se incluyen `Filters` con valor; los integers nunca van como `""`.
 *  - El rango de vencimiento y saldo tiene defaults amplios para no obligar al
 *    caller a calcular (la doc Zeta los marca obligatorios).
 */
export function buildQueryClienteInData(
  page: string,
  filters: ZetaInstallmentsQueryFilters
): { Page: string; Filters: Record<string, unknown> } {
  const filtersOut: Record<string, unknown> = {};

  // Vencimiento (obligatorios según doc — siempre presentes con defaults).
  filtersOut.CuotaVencimientoDesde = filters.cuotaVencimientoDesde?.trim() || DEFAULT_VENC_DESDE;
  filtersOut.CuotaVencimientoHasta = filters.cuotaVencimientoHasta?.trim() || DEFAULT_VENC_HASTA;

  // Saldo (obligatorios según doc — siempre presentes con defaults).
  const saldoDesde = filters.cuotaSaldoDesde ?? DEFAULT_SALDO_DESDE;
  const saldoHasta = filters.cuotaSaldoHasta ?? DEFAULT_SALDO_HASTA;
  filtersOut.CuotaSaldoDesde = typeof saldoDesde === "string" ? Number(saldoDesde) : saldoDesde;
  filtersOut.CuotaSaldoHasta = typeof saldoHasta === "string" ? Number(saldoHasta) : saldoHasta;

  // Opcionales: NO enviar si vacío para evitar binder ASP.NET 400 (ver doc en
  // `zeta-collection-receipts-fetch.ts` regla 1).
  const cliente = filters.clienteCodigo?.trim();
  if (cliente) filtersOut.ClienteCodigo = cliente;

  const registroIdRaw = filters.registroId;
  if (registroIdRaw !== undefined && registroIdRaw !== null) {
    const n = typeof registroIdRaw === "string" ? Number(registroIdRaw.trim()) : Number(registroIdRaw);
    if (Number.isFinite(n) && n > 0) filtersOut.RegistroId = n;
  }

  const moneda = filters.monedaCodigo;
  if (moneda !== undefined && moneda !== null && String(moneda).trim() !== "") {
    const mn = typeof moneda === "string" ? Number(moneda.trim()) : Number(moneda);
    if (Number.isFinite(mn) && mn > 0) filtersOut.MonedaCodigo = mn;
  }

  return {
    Page: page,
    Filters: filtersOut,
  };
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

function classifyErr(err: unknown): FetchZetaInstallmentsErr["error_code"] {
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

function resolveHasMore(raw: unknown, rows: ZetaInstallmentRecord[], warnings: string[]): boolean {
  const flags = readZetaInstallmentsQueryOutFlags(raw);
  if (flags.isLastPage === true) return false;
  if (flags.isLastPage === false) return true;
  // Heurística: si trae 500 filas (page size doc), asumir hay más.
  if (rows.length >= 500) {
    warnings.push("Sin IsLastPage en QueryOut pero rows>=500 (page size doc) → asumir hasMore=true");
    return true;
  }
  if (rows.length > 0) {
    warnings.push("Sin IsLastPage en QueryOut; rows<500; asumir hasMore=false");
  }
  return false;
}

/**
 * POST `RESTCuotasV1QueryCliente` — transporte + validación contractual + paginación.
 *
 * Ejemplo:
 *   const r = await fetchZetaInstallments({
 *     ctx: { requestId: "uuid", tenantId: "x" },
 *     page: "1",
 *     filters: { clienteCodigo: "C0001", cuotaVencimientoDesde: "2024-01-01" },
 *   });
 */
export async function fetchZetaInstallments(
  params: FetchZetaInstallmentsParams
): Promise<FetchZetaInstallmentsResult> {
  const zeta_method = ZETA_INSTALLMENTS_METHOD;
  const rootInKey = ZETA_INSTALLMENTS_ROOT_IN_KEY;
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
  const data = buildQueryClienteInData(page, params.filters);
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

  console.log(
    "ZETA INSTALLMENTS PAYLOAD SHAPE:",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "zeta_installments_fetch",
      kind: "zeta_installments_payload_shape",
      request_id: params.ctx.requestId,
      sync_run_id: params.ctx.syncRunId ?? null,
      tenant_id: params.ctx.tenantId ?? null,
      zeta_method,
      root_in_key: rootInKey,
      top_level_keys: Object.keys(payloadForLog),
      request_keys: Object.keys((payloadForLog[rootInKey] as Record<string, unknown>) ?? {}),
      data_keys: Object.keys(data),
      filters_keys: Object.keys(data.Filters),
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

    const responseShape = summarizeZetaInstallmentsResponseShape(raw);
    console.log(
      "ZETA INSTALLMENTS RAW RESPONSE:",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: "zeta_installments_fetch",
        kind: "zeta_installments_raw_response",
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
    if (!isZetaInstallmentsQueryResponse(raw)) {
      logZetaError({
        request_id: params.ctx.requestId,
        endpoint: zeta_method,
        empresa_codigo: empresaCodigo,
        tenant_id: params.ctx.tenantId,
        sync_run_id: params.ctx.syncRunId,
        code: "zeta_shape",
        message: "HTTP OK pero cuerpo no coincide con QueryClienteOut.Response[] ni array raíz documentado.",
        http_status: res.status,
        duration_ms: duration,
      });
      return {
        ok: false,
        rows: [],
        errors: ["Estructura inesperada: se esperaba QueryClienteOut.Response o array de cuotas."],
        warnings,
        error_code: "zeta_shape",
        requestUrl: url,
        httpStatus: res.status,
        raw,
        zeta_method,
      };
    }

    const rows = extractZetaInstallments(raw, { request_id: params.ctx.requestId });
    const discarded = countZetaInstallmentsDiscarded(raw);
    if (discarded > 0) {
      logZetaError({
        request_id: params.ctx.requestId,
        endpoint: zeta_method,
        empresa_codigo: empresaCodigo,
        tenant_id: params.ctx.tenantId,
        sync_run_id: params.ctx.syncRunId,
        code: "zeta_shape",
        message: `Cuotas: ${discarded} fila(s) descartadas por falta de RegistroId/CuotaNumero`,
        http_status: res.status,
        duration_ms: duration,
      });
      warnings.push(`${discarded} fila(s) descartadas (RegistroId/CuotaNumero ausente).`);
    }
    const flags = readZetaInstallmentsQueryOutFlags(raw);
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
