import { ZetaConfigurationError } from "@/lib/integrations/zeta/zeta-connection";
import type { ZetaStaticCredentials } from "@/lib/integrations/zeta/zeta-connection-types";

const DEFAULT_BASE = "https://api.zetasoftware.com/rest/APIs";

/**
 * Lee credenciales **solo server-side** (sin prefijo `NEXT_PUBLIC_`).
 * Variables esperadas:
 * - `ZETA_API_BASE_URL` (opcional, default API pública ZetaSoftware)
 * - `ZETA_DESARROLLADOR_CODIGO`, `ZETA_DESARROLLADOR_CLAVE`
 * - `ZETA_EMPRESA_CODIGO`, `ZETA_EMPRESA_CLAVE`
 * - `ZETA_ROL_CODIGO` (opcional, default `"1"` según documentación)
 * - `ZETA_REQUEST_TIMEOUT_MS` (opcional, default 30000)
 * - `ZETA_MAX_RETRIES` (opcional, default 3)
 */
export function loadZetaServerConfig(): {
  baseUrl: string;
  credentials: ZetaStaticCredentials;
  timeoutMs: number;
  maxRetries: number;
} {
  const baseUrl = (process.env.ZETA_API_BASE_URL ?? DEFAULT_BASE).replace(
    /\/+$/,
    ""
  );

  const dc = process.env.ZETA_DESARROLLADOR_CODIGO?.trim();
  const dk = process.env.ZETA_DESARROLLADOR_CLAVE?.trim();
  const ec = process.env.ZETA_EMPRESA_CODIGO?.trim();
  const ek = process.env.ZETA_EMPRESA_CLAVE?.trim();
  const rol = process.env.ZETA_ROL_CODIGO?.trim() || "1";

  const missing: string[] = [];
  if (!dc) missing.push("ZETA_DESARROLLADOR_CODIGO");
  if (!dk) missing.push("ZETA_DESARROLLADOR_CLAVE");
  if (!ec) missing.push("ZETA_EMPRESA_CODIGO");
  if (!ek) missing.push("ZETA_EMPRESA_CLAVE");
  if (missing.length) {
    throw new ZetaConfigurationError(
      `Variables de entorno Zeta faltantes: ${missing.join(", ")}.`
    );
  }

  const credentials: ZetaStaticCredentials = {
    desarrolladorCodigo: dc as string,
    desarrolladorClave: dk as string,
    empresaCodigo: ec as string,
    empresaClave: ek as string,
    rolCodigo: rol,
  };

  const timeoutMs = Math.min(
    120_000,
    Math.max(5_000, Number(process.env.ZETA_REQUEST_TIMEOUT_MS) || 30_000)
  );
  const maxRetries = Math.min(
    6,
    Math.max(0, Math.floor(Number(process.env.ZETA_MAX_RETRIES) || 3))
  );

  return { baseUrl, credentials, timeoutMs, maxRetries };
}
