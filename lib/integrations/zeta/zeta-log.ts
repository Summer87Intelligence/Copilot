import { serializeError } from "@/lib/copilot-structured-logger";

export type ZetaLogLevel = "info" | "warn" | "error";

export type ZetaLogFields = {
  request_id: string;
  /** Path relativo del método REST, p. ej. `RESTFacturaClienteV4QuerySaldosPendientes`. */
  zeta_method: string;
  tenant_id?: string;
  sync_run_id?: string;
  zeta_attempt: number;
  http_status?: number;
  /** Resultado de negocio si se pudo inferir sin volcar payload. */
  zeta_succeed?: boolean;
  /** Código/mensaje de error de negocio (sanitizado, corto). */
  zeta_error_code?: string;
  zeta_error_message?: string;
};

function emit(level: ZetaLogLevel, message: string, fields: ZetaLogFields, err?: unknown) {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    source: "zeta_connector",
    ...fields,
  };
  if (err !== undefined) payload.error = serializeError(err);
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const zetaLog = {
  info(message: string, fields: ZetaLogFields) {
    emit("info", message, fields);
  },
  warn(message: string, fields: ZetaLogFields, err?: unknown) {
    emit("warn", message, fields, err);
  },
  error(message: string, fields: ZetaLogFields, err?: unknown) {
    emit("error", message, fields, err);
  },
};
