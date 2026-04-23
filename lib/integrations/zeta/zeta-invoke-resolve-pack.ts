/**
 * Resolución de credenciales + config HTTP Zeta (compartida por integraciones REST).
 */

import { loadZetaServerConfig } from "@/lib/integrations/zeta/zeta-config";
import type { ZetaStaticCredentials } from "@/lib/integrations/zeta/zeta-connection-types";
import type { ZetaServerConfig } from "@/lib/integrations/zeta/zeta-invoke";

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

function resolveDeveloperCredentials(): { codigo: string; clave: string } | null {
  const codigo =
    trimEnv("ZETA_DEVELOPER_CODE") ?? trimEnv("ZETA_DESARROLLADOR_CODIGO");
  const clave =
    trimEnv("ZETA_DEVELOPER_KEY") ?? trimEnv("ZETA_DESARROLLADOR_CLAVE");
  if (codigo && clave) return { codigo, clave };
  return null;
}

function collectLegacyConfigErrors(): string[] {
  const errors: string[] = [];
  if (!trimEnv("ZETA_COMPANY_CODE") && !trimEnv("ZETA_EMPRESA_CODIGO")) {
    errors.push("Falta ZETA_COMPANY_CODE o ZETA_EMPRESA_CODIGO.");
  }
  if (!trimEnv("ZETA_COMPANY_KEY") && !trimEnv("ZETA_EMPRESA_CLAVE")) {
    errors.push("Falta ZETA_COMPANY_KEY o ZETA_EMPRESA_CLAVE.");
  }
  if (!trimEnv("ZETA_ROLE_CODE") && !trimEnv("ZETA_ROL_CODIGO")) {
    errors.push("Falta ZETA_ROLE_CODE o ZETA_ROL_CODIGO.");
  }
  if (!resolveDeveloperCredentials()) {
    errors.push(
      "Autenticación Zeta: faltan credenciales de desarrollador (ZETA_DEVELOPER_CODE / ZETA_DEVELOPER_KEY o equivalentes en español)."
    );
  }
  return errors;
}

export type ZetaInvokePack = {
  credentials: ZetaStaticCredentials;
  config: ZetaServerConfig;
};

export function resolveInvokePack(): { ok: true; pack: ZetaInvokePack } | { ok: false; errors: string[] } {
  try {
    const loaded = loadZetaServerConfig();
    return {
      ok: true,
      pack: {
        credentials: loaded.credentials,
        config: {
          ...loaded,
          maxRetries: Math.min(2, loaded.maxRetries),
        },
      },
    };
  } catch {
    const errs = collectLegacyConfigErrors();
    if (errs.length) return { ok: false, errors: errs };
    const dev = resolveDeveloperCredentials()!;
    const empresaCodigo = trimEnv("ZETA_EMPRESA_CODIGO") ?? trimEnv("ZETA_COMPANY_CODE")!;
    const empresaClave = trimEnv("ZETA_EMPRESA_CLAVE") ?? trimEnv("ZETA_COMPANY_KEY")!;
    const rolCodigo = trimEnv("ZETA_ROL_CODIGO") ?? trimEnv("ZETA_ROLE_CODE") ?? "1";
    const credentials: ZetaStaticCredentials = {
      desarrolladorCodigo: dev.codigo,
      desarrolladorClave: dev.clave,
      empresaCodigo,
      empresaClave,
      rolCodigo,
    };
    const baseUrl = (trimEnv("ZETA_API_BASE_URL") ?? "https://api.zetasoftware.com/rest/APIs").replace(
      /\/+$/,
      ""
    );
    const timeoutMs = Math.min(
      120_000,
      Math.max(5_000, Number(process.env.ZETA_REQUEST_TIMEOUT_MS) || 30_000)
    );
    const config: ZetaServerConfig = {
      baseUrl,
      credentials,
      timeoutMs,
      maxRetries: Math.min(2, Math.max(0, Math.floor(Number(process.env.ZETA_MAX_RETRIES) || 2))),
    };
    return { ok: true, pack: { credentials, config } };
  }
}
