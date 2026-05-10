/**
 * OBS-02: Logger estructurado central para pipelines, crons y librerías internas.
 *
 * Complementa `copilot-structured-logger.ts` (OBS-01), que maneja rutas HTTP.
 * Este logger es para uso interno: pipelines Zeta, cron jobs, librerías.
 *
 * Reglas:
 * - Siempre emite JSON estructurado.
 * - `debug` solo si `COPILOT_LOG_DEBUG=1|true` (o un override de tests).
 * - Payloads se sanitizan automáticamente (claves sensibles → [REDACTED]).
 * - Errores se serializan de forma segura (sin stack en producción).
 * - Compatible con Vercel logs: una línea JSON por entrada.
 */

import { sanitizeLogPayload, sanitizeError } from "@/lib/observability/sanitize";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  source?: string;
  pipeline?: string;
  step?: string;
  runId?: string;
  tenantId?: string;
  workspaceCompanyId?: string;
  companyId?: string;
  correlationId?: string;
  [key: string]: unknown;
};

export type LogPayload = Record<string, unknown>;

export type Logger = {
  info(event: string, context?: LogContext, payload?: LogPayload): void;
  warn(event: string, context?: LogContext, payload?: LogPayload): void;
  error(event: string, context?: LogContext, payload?: LogPayload): void;
  debug(event: string, context?: LogContext, payload?: LogPayload): void;
  /** Creates a child logger that inherits and extends the default context. */
  child(context: LogContext): Logger;
};

const DEBUG_ENABLED =
  process.env.COPILOT_LOG_DEBUG === "1" ||
  process.env.COPILOT_LOG_DEBUG === "true";

function consoleEmit(level: LogLevel, line: string): void {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function buildLine(
  level: LogLevel,
  event: string,
  defaultContext: LogContext,
  context: LogContext | undefined,
  payload: LogPayload | undefined
): string {
  const mergedCtx = context ? { ...defaultContext, ...context } : defaultContext;
  const sanitizedPayload = payload ? sanitizeLogPayload(payload) : undefined;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message: event,
    ...mergedCtx,
    ...(sanitizedPayload ?? {}),
  };

  return JSON.stringify(entry);
}

export function createLogger(defaultContext: LogContext = {}): Logger {
  function emit(
    level: LogLevel,
    event: string,
    context?: LogContext,
    payload?: LogPayload
  ): void {
    if (level === "debug" && !DEBUG_ENABLED) return;
    consoleEmit(level, buildLine(level, event, defaultContext, context, payload));
  }

  return {
    info: (event, context?, payload?) => emit("info", event, context, payload),
    warn: (event, context?, payload?) => emit("warn", event, context, payload),
    error: (event, context?, payload?) => emit("error", event, context, payload),
    debug: (event, context?, payload?) => emit("debug", event, context, payload),
    child: (context) => createLogger({ ...defaultContext, ...context }),
  };
}

/** Default singleton logger without context. Use `createLogger()` for scoped loggers. */
export const logger = createLogger();

/**
 * Convenience: emit an error event with a serialized `error` field.
 *
 * Usage:
 *   const scoped = createLogger({ source: "zeta_pipeline" });
 *   emitError(scoped, "zeta_request_failed", err, { request_id: "..." });
 */
export function emitError(
  log: Logger,
  event: string,
  err: unknown,
  context?: LogContext,
  payload?: LogPayload
): void {
  const errField = sanitizeError(err);
  log.error(event, context, { ...(payload ?? {}), error: errField });
}
