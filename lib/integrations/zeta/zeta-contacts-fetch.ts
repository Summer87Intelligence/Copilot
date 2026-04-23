/**
 * Lectura determinística de contactos Zeta (`RESTContactosV3Query`) vía `zetaInvokeConnectionAndData`.
 */

import {
  extractZetaContacts,
  isZetaContactsResponse,
  readZetaContactsQueryOutFlags,
  type ZetaContact,
} from "@/lib/integrations/zeta/contracts/zeta-contacts.contract";
import { buildZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection";
import { zetaInvokeConnectionAndData } from "@/lib/integrations/zeta/zeta-invoke";
import { resolveInvokePack } from "@/lib/integrations/zeta/zeta-invoke-resolve-pack";
import { ZetaHttpError, type ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { logZetaError, logZetaRequest, logZetaResponse } from "@/lib/integrations/zeta/zeta-logger";
import { ZETA_METHOD_LIST_CONTACTS } from "@/lib/integrations/zeta/zeta-clients";

export type { ZetaContact };

export type ZetaContactsFetchFilters = {
  esCliente: string;
  search?: string;
  extraStringFilters?: Record<string, string>;
};

export type FetchZetaContactsParams = {
  ctx: ZetaCallContext;
  page: string;
  /**
   * Reservado para telemetría / futuros filtros; la API documentada usa `Data.Page`.
   * No se envía como campo inventado si no está en `extraStringFilters`.
   */
  pageSize: number;
  filters: ZetaContactsFetchFilters;
};

export type FetchZetaContactsOk = {
  ok: true;
  contacts: ZetaContact[];
  total?: number;
  hasMore: boolean;
  requestUrl: string;
  httpStatus: number;
  raw: unknown;
  warnings: string[];
};

export type FetchZetaContactsErr = {
  ok: false;
  contacts: [];
  errors: string[];
  warnings: string[];
  error_code: "zeta_config" | "zeta_http" | "zeta_shape" | "zeta_timeout" | "zeta_rate_limit" | "zeta_unknown";
  requestUrl: string;
  httpStatus: number | null;
  raw: unknown | null;
};

export type FetchZetaContactsResult = FetchZetaContactsOk | FetchZetaContactsErr;

/** @deprecated Prefer {@link FetchZetaContactsParams} + resultado tipado. */
export type FetchZetaContactsOptions = {
  page?: string;
  esCliente?: string;
  search?: string;
  pageSize?: number;
  ctx?: ZetaCallContext;
};

function buildQueryInData(page: string, filters: ZetaContactsFetchFilters): Record<string, unknown> {
  const f: Record<string, string> = {
    EsCliente: filters.esCliente,
  };
  if (filters.search) f.Search = filters.search;
  if (filters.extraStringFilters) {
    for (const [k, v] of Object.entries(filters.extraStringFilters)) {
      if (v) f[k] = v;
    }
  }
  return {
    Page: page,
    Filters: f,
  };
}

function classifyErr(err: unknown): FetchZetaContactsErr["error_code"] {
  if (err instanceof ZetaHttpError) {
    if (err.httpStatus === 401 || err.httpStatus === 403) return "zeta_http";
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

/**
 * POST `RESTContactosV3Query` con envelope `QueryIn` y parseo estricto de `QueryOut.Contactos.Contacto`.
 */
export async function fetchZetaContactsTyped(
  params: FetchZetaContactsParams
): Promise<FetchZetaContactsResult> {
  const page = (params.page ?? "1").trim() || "1";
  const filters: ZetaContactsFetchFilters = {
    esCliente: (params.filters.esCliente ?? "S").trim() || "S",
    search: params.filters.search?.trim(),
    extraStringFilters: params.filters.extraStringFilters,
  };

  const resolved = resolveInvokePack();
  const baseUrl = resolved.ok ? resolved.pack.config.baseUrl.replace(/\/+$/, "") : "";
  const url = `${baseUrl}/${ZETA_METHOD_LIST_CONTACTS}`;

  if (!resolved.ok) {
    return {
      ok: false,
      contacts: [],
      errors: resolved.errors,
      warnings: [],
      error_code: "zeta_config",
      requestUrl: url || `${ZETA_METHOD_LIST_CONTACTS}`,
      httpStatus: null,
      raw: null,
    };
  }

  const { credentials, config } = resolved.pack;
  const empresaCodigo = credentials.empresaCodigo;
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
        Data: buildQueryInData(page, filters),
      },
    }),
    "utf8"
  );

  logZetaRequest({
    request_id: params.ctx.requestId,
    endpoint: ZETA_METHOD_LIST_CONTACTS,
    empresa_codigo: empresaCodigo,
    tenant_id: params.ctx.tenantId,
    sync_run_id: params.ctx.syncRunId,
    payload_size_bytes: bodyBytes,
  });

  const started = Date.now();
  try {
    const res = await zetaInvokeConnectionAndData(params.ctx, {
      methodName: ZETA_METHOD_LIST_CONTACTS,
      rootInKey: "QueryIn",
      data: buildQueryInData(page, filters),
      credentials,
      config,
    });
    const duration = Date.now() - started;
    const raw = res.json;
    const responseBytes = Buffer.byteLength(JSON.stringify(raw ?? res.textFallback), "utf8");

    logZetaResponse({
      request_id: params.ctx.requestId,
      endpoint: ZETA_METHOD_LIST_CONTACTS,
      empresa_codigo: empresaCodigo,
      tenant_id: params.ctx.tenantId,
      sync_run_id: params.ctx.syncRunId,
      http_status: res.status,
      duration_ms: duration,
      payload_size_bytes: responseBytes,
    });

    if (!res.status || res.status < 200 || res.status >= 300) {
      const code: FetchZetaContactsErr["error_code"] =
        res.status === 429 ? "zeta_rate_limit" : res.status === 401 || res.status === 403 ? "zeta_http" : "zeta_http";
      return {
        ok: false,
        contacts: [],
        errors: [`Zeta HTTP ${res.status}: respuesta no OK.`],
        warnings: [],
        error_code: code,
        requestUrl: url,
        httpStatus: res.status,
        raw,
      };
    }

    const warnings: string[] = [];
    if (!isZetaContactsResponse(raw)) {
      logZetaError({
        request_id: params.ctx.requestId,
        endpoint: ZETA_METHOD_LIST_CONTACTS,
        empresa_codigo: empresaCodigo,
        tenant_id: params.ctx.tenantId,
        sync_run_id: params.ctx.syncRunId,
        code: "zeta_shape",
        message: "La respuesta HTTP OK no coincide con QueryOut.Contactos.Contacto.",
        http_status: res.status,
        duration_ms: duration,
      });
      return {
        ok: false,
        contacts: [],
        errors: ["Estructura inesperada: se esperaba QueryOut.Contactos.Contacto."],
        warnings,
        error_code: "zeta_shape",
        requestUrl: url,
        httpStatus: res.status,
        raw,
      };
    }

    const contacts = extractZetaContacts(raw);
    const flags = readZetaContactsQueryOutFlags(raw);
    let hasMore: boolean;
    if (flags.isLastPage === true) hasMore = false;
    else if (flags.isLastPage === false) hasMore = true;
    else {
      hasMore = false;
      if (contacts.length > 0) {
        warnings.push(
          "QueryOut sin IsLastPage reconocible; se asume una sola página. Si hay más datos, ampliar contrato o filtros."
        );
      }
    }

    return {
      ok: true,
      contacts,
      total: flags.total,
      hasMore,
      requestUrl: url,
      httpStatus: res.status,
      raw,
      warnings,
    };
  } catch (err) {
    const duration = Date.now() - started;
    const ec = classifyErr(err);
    logZetaError({
      request_id: params.ctx.requestId,
      endpoint: ZETA_METHOD_LIST_CONTACTS,
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
      contacts: [],
      errors: [errMessage(err)],
      warnings: [],
      error_code: ec,
      requestUrl: url,
      httpStatus: err instanceof ZetaHttpError ? err.httpStatus : null,
      raw: null,
    };
  }
}

/**
 * Compatibilidad con llamadas sin `ctx` (p. ej. scripts): genera `request_id` efímero.
 */
export async function fetchZetaContacts(
  options: FetchZetaContactsOptions = {}
): Promise<FetchZetaContactsResult> {
  const ctx: ZetaCallContext = options.ctx ?? {
    requestId: globalThis.crypto?.randomUUID?.() ?? `zeta-${Date.now()}`,
  };
  return fetchZetaContactsTyped({
    ctx,
    page: options.page ?? "1",
    pageSize: options.pageSize ?? 500,
    filters: {
      esCliente: options.esCliente ?? "S",
      search: options.search,
    },
  });
}
