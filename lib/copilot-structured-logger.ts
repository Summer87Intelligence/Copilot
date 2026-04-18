/**
 * OBS-01 — Logging estructurado mínimo (Copilot API)
 *
 * Convención:
 * - `request_id`: cabecera entrante `X-Request-Id` (case-insensitive en fetch; acá leemos
 *   `x-request-id`). Si no viene, se genera `crypto.randomUUID()` por request.
 * - `tenant_id`: UUID de `public.companies` (SEC-01: `auth.ctx.tenantCompanyId`). Usar
 *   `copilotRequestLogger(request).withTenant(auth.ctx.tenantCompanyId)` tras auth OK.
 * - `sync_run_id`: opcional; cabecera `X-Sync-Run-Id` o `.withSyncRunId(id)` para correlación
 *   futura con corridas Zeta (no se usa aún en producto).
 * - Niveles: `info` (hechos útiles poco frecuentes), `warn` (auth/validación/estados dudosos),
 *   `error` (fallos y excepciones). `debug` solo si `COPILOT_LOG_DEBUG=1` o `true`.
 * - No loguear bodies, JWT, cookies ni payloads sensibles; extras deben ser metadatos seguros.
 */
import type { NextRequest } from "next/server";

export type CopilotLogLevel = "info" | "warn" | "error" | "debug";

const DEBUG_ENABLED =
  process.env.COPILOT_LOG_DEBUG === "1" ||
  process.env.COPILOT_LOG_DEBUG === "true";

export type SerializedError = Record<string, unknown> | string;

/** Serializa `unknown` para campo `error` en el JSON de log (sin volcar objetos arbitrarios grandes). */
export function serializeError(err: unknown): SerializedError {
  if (err === null || err === undefined) {
    return { message: String(err) };
  }
  if (err instanceof Error) {
    const o: Record<string, unknown> = {
      name: err.name,
      message: err.message,
    };
    if (process.env.NODE_ENV !== "production" && err.stack) {
      o.stack = err.stack;
    }
    return o;
  }
  if (typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    const code = (err as { code?: unknown }).code;
    const details = (err as { details?: unknown }).details;
    const hint = (err as { hint?: unknown }).hint;
    const out: Record<string, unknown> = {};
    if (typeof msg === "string") out.message = msg;
    if (code !== undefined) out.code = code;
    if (details !== undefined) out.details = details;
    if (hint !== undefined) out.hint = hint;
    if (Object.keys(out).length > 0) return out;
    try {
      return JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
    } catch {
      return { message: String(err) };
    }
  }
  return { message: String(err) };
}

type EmitterCtx = {
  request_id: string;
  endpoint: string;
  tenant_id?: string;
  sync_run_id?: string;
};

function emit(
  ctx: EmitterCtx,
  level: CopilotLogLevel,
  message: string,
  fields?: Record<string, unknown>,
  error?: unknown
): void {
  if (level === "debug" && !DEBUG_ENABLED) return;

  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    request_id: ctx.request_id,
    endpoint: ctx.endpoint,
    ...fields,
  };
  if (ctx.tenant_id) payload.tenant_id = ctx.tenant_id;
  if (ctx.sync_run_id) payload.sync_run_id = ctx.sync_run_id;
  if (error !== undefined) payload.error = serializeError(error);

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type CopilotRequestLogger = {
  readonly requestId: string;
  withTenant(tenantId: string): CopilotRequestLogger;
  withSyncRunId(syncRunId: string): CopilotRequestLogger;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, err?: unknown, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
};

function makeLogger(ctx: EmitterCtx): CopilotRequestLogger {
  return {
    requestId: ctx.request_id,
    withTenant(tenantId: string) {
      return makeLogger({ ...ctx, tenant_id: tenantId });
    },
    withSyncRunId(syncRunId: string) {
      return makeLogger({ ...ctx, sync_run_id: syncRunId });
    },
    info(message, fields) {
      emit(ctx, "info", message, fields);
    },
    warn(message, fields) {
      emit(ctx, "warn", message, fields);
    },
    error(message, err, fields) {
      emit(ctx, "error", message, fields, err);
    },
    debug(message, fields) {
      emit(ctx, "debug", message, fields);
    },
  };
}

/**
 * Crea el logger base para un `NextRequest` (aún sin tenant hasta pasar auth).
 */
export function copilotRequestLogger(request: NextRequest): CopilotRequestLogger {
  const request_id =
    request.headers.get("x-request-id")?.trim() ||
    globalThis.crypto.randomUUID();
  const sync_run_id = request.headers.get("x-sync-run-id")?.trim() || undefined;
  const endpoint = request.nextUrl?.pathname ?? "";
  return makeLogger({
    request_id,
    endpoint,
    ...(sync_run_id ? { sync_run_id } : {}),
  });
}
