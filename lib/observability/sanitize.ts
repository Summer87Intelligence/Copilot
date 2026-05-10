/**
 * OBS-02: Sanitización de payloads para logging seguro.
 *
 * Regla: ningún campo de log debe contener tokens, credenciales,
 * cookies ni payloads completos de respuestas externas.
 */

import { serializeError } from "@/lib/copilot-structured-logger";

export type { SerializedError } from "@/lib/copilot-structured-logger";

/**
 * Claves cuyo valor se redacta antes de emitir cualquier log.
 * Case-insensitive en la comparación.
 */
export const SENSITIVE_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "apikey",
  "api_key",
  "password",
  "passwd",
  "secret",
  "credential",
  "credentials",
  "cookie",
  "cookies",
  "rawpayload",
  "raw_payload",
  "payload",
  "responsebody",
  "response_body",
  "x-api-key",
  "x_api_key",
  "private_key",
  "privatekey",
  "client_secret",
  "clientsecret",
]);

export const REDACTED = "[REDACTED]";

/**
 * Redacta claves sensibles en un objeto plano de log.
 * No realiza deep-clone de valores seguros (optimización de rendimiento).
 */
export function redactSensitiveKeys(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return result;
}

/**
 * Sanitiza un payload de log: redacta claves sensibles a nivel raíz.
 * Preserva tipos de valores seguros sin copiarlos.
 */
export function sanitizeLogPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return redactSensitiveKeys(payload);
}

/**
 * Serializa un error de forma segura para inclusión en logs.
 * Delega a `serializeError` (OBS-01) para consistencia.
 */
export function sanitizeError(err: unknown): ReturnType<typeof serializeError> {
  return serializeError(err);
}
