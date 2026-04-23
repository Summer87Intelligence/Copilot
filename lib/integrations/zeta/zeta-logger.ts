/**
 * Observabilidad Zeta: request / response / error con tamaño de payload y tiempos.
 * Complementa `zeta-log.ts` (intentos HTTP) con métricas de negocio del conector.
 */

import { serializeError } from "@/lib/copilot-structured-logger";

export type ZetaLoggerErrorExtra = Record<string, unknown>;

export type ZetaRequestLog = {
  request_id: string;
  endpoint: string;
  empresa_codigo: string;
  tenant_id?: string;
  sync_run_id?: string;
  attempt?: number;
  payload_size_bytes: number;
  /** Diagnóstico (payload Data, rootInKey, etc.) — no incluir secretos en crudo. */
  extra?: ZetaLoggerErrorExtra;
};

export type ZetaResponseLog = ZetaRequestLog & {
  http_status: number;
  duration_ms: number;
};

export type ZetaErrorLog = {
  request_id: string;
  endpoint: string;
  empresa_codigo: string;
  tenant_id?: string;
  sync_run_id?: string;
  code: string;
  message: string;
  duration_ms?: number;
  http_status?: number;
  extra?: ZetaLoggerErrorExtra;
  err?: unknown;
};

function line(payload: Record<string, unknown>) {
  const out = JSON.stringify({
    timestamp: new Date().toISOString(),
    source: "zeta_connector",
    ...payload,
  });
  console.log(out);
}

export function logZetaRequest(fields: ZetaRequestLog) {
  const { extra, ...rest } = fields;
  line({
    level: "info",
    kind: "zeta_request",
    ...rest,
    ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

export function logZetaResponse(fields: ZetaResponseLog) {
  const { extra, ...rest } = fields;
  line({
    level: "info",
    kind: "zeta_response",
    ...rest,
    ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

export function logZetaError(fields: ZetaErrorLog) {
  const payload: Record<string, unknown> = {
    level: "error",
    kind: "zeta_error",
    request_id: fields.request_id,
    endpoint: fields.endpoint,
    empresa_codigo: fields.empresa_codigo,
    tenant_id: fields.tenant_id,
    sync_run_id: fields.sync_run_id,
    code: fields.code,
    message: fields.message,
    duration_ms: fields.duration_ms,
    http_status: fields.http_status,
    extra: fields.extra,
  };
  if (fields.err !== undefined) {
    payload.error = serializeError(fields.err);
  }
  const out = JSON.stringify({
    timestamp: new Date().toISOString(),
    source: "zeta_connector",
    ...payload,
  });
  console.error(out);
}
