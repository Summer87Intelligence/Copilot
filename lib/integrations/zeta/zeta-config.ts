import { createClient } from "@supabase/supabase-js";
import { ZetaConfigurationError } from "@/lib/integrations/zeta/zeta-connection";
import type { ZetaStaticCredentials } from "@/lib/integrations/zeta/zeta-connection-types";

const DEFAULT_BASE = "https://api.zetasoftware.com/rest/APIs";

type ZetaEnvFormat = "B" | "A";

function readTrimmed(key: string): string | undefined {
  const v = process.env[key];
  const t = v?.trim();
  return t || undefined;
}

/**
 * Prioriza convención B (nombres en español), fallback a A (nombres en inglés).
 */
function pickWithFallback(
  keyB: string,
  keyA: string
): { value: string | undefined; format: ZetaEnvFormat | null } {
  const fromB = readTrimmed(keyB);
  if (fromB) return { value: fromB, format: "B" };
  const fromA = readTrimmed(keyA);
  if (fromA) return { value: fromA, format: "A" };
  return { value: undefined, format: null };
}

function logDevZetaEnvResolution(parts: {
  key: string;
  format: ZetaEnvFormat | "default" | null;
}[]): void {
  if (process.env.NODE_ENV !== "development") return;
  const detail = parts
    .map((p) => `${p.key}=${p.format ?? "—"}`)
    .join(", ");
  const ab = parts
    .map((p) => p.format)
    .filter((f): f is ZetaEnvFormat => f === "A" || f === "B");
  const onlyB = ab.length > 0 && ab.every((f) => f === "B");
  const onlyA = ab.length > 0 && ab.every((f) => f === "A");
  const resumen =
    onlyB ? "formato B (español)" : onlyA ? "formato A (inglés)" : "mixto B+A";
  console.log(`[zeta-config] Zeta env: ${resumen} — ${detail}`);
}

// ---------------------------------------------------------------------------
// DB Lookup: workspace_integrations
// ---------------------------------------------------------------------------

type ZetaIntegrationRow = {
  credentials: {
    desarrolladorCodigo?: string;
    desarrolladorClave?: string;
    empresaCodigo?: string;
    empresaClave?: string;
    rolCodigo?: string;
    baseUrl?: string;
  } | null;
};

/**
 * ZETA-17: Intenta leer credenciales Zeta desde `workspace_integrations` para el workspace dado.
 * Usa service_role key (server-side only).
 * Retorna null si no hay row activa o si las credenciales están incompletas.
 * Never throws — el caller hace fallback a env vars.
 */
async function loadZetaCredentialsFromDb(
  workspaceCompanyId: string
): Promise<ZetaStaticCredentials | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return null;

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data, error } = await client
      .from("workspace_integrations")
      .select("credentials")
      .eq("workspace_company_id", workspaceCompanyId)
      .eq("provider", "zeta")
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) return null;

    const row = data as ZetaIntegrationRow;
    const c = row.credentials;
    if (!c) return null;

    // Validar campos obligatorios
    if (!c.desarrolladorCodigo || !c.desarrolladorClave ||
        !c.empresaCodigo || !c.empresaClave) {
      return null;
    }

    return {
      desarrolladorCodigo: c.desarrolladorCodigo,
      desarrolladorClave: c.desarrolladorClave,
      empresaCodigo: c.empresaCodigo,
      empresaClave: c.empresaClave,
      rolCodigo: c.rolCodigo ?? "1",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Env vars reader (original, sin cambios)
// ---------------------------------------------------------------------------

/**
 * Lee credenciales **solo server-side** (sin prefijo `NEXT_PUBLIC_`).
 *
 * Convención **B** (prioritaria): `ZETA_EMPRESA_*`, `ZETA_DESARROLLADOR_*`, `ZETA_ROL_CODIGO`.
 * Convención **A** (fallback): `ZETA_COMPANY_*`, `ZETA_DEVELOPER_*`, `ZETA_ROLE_CODE`.
 *
 * Variables opcionales / comunes:
 * - `ZETA_API_BASE_URL` (opcional, default API pública ZetaSoftware)
 * - `ZETA_REQUEST_TIMEOUT_MS` (opcional, default 30000)
 * - `ZETA_MAX_RETRIES` (opcional, default 3)
 * - Rol: `ZETA_ROL_CODIGO` o `ZETA_ROLE_CODE` o default `"1"`.
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

  const empresaCodigo = pickWithFallback(
    "ZETA_EMPRESA_CODIGO",
    "ZETA_COMPANY_CODE"
  );
  const empresaClave = pickWithFallback(
    "ZETA_EMPRESA_CLAVE",
    "ZETA_COMPANY_KEY"
  );
  const desarrolladorCodigo = pickWithFallback(
    "ZETA_DESARROLLADOR_CODIGO",
    "ZETA_DEVELOPER_CODE"
  );
  const desarrolladorClave = pickWithFallback(
    "ZETA_DESARROLLADOR_CLAVE",
    "ZETA_DEVELOPER_KEY"
  );

  const rolB = readTrimmed("ZETA_ROL_CODIGO");
  const rolA = readTrimmed("ZETA_ROLE_CODE");
  const rol = rolB ?? rolA ?? "1";
  const rolFormat: ZetaEnvFormat | "default" = rolB ? "B" : rolA ? "A" : "default";

  const missing: { label: string; keys: string }[] = [];
  if (!desarrolladorCodigo.value) {
    missing.push({
      label: "desarrollador codigo",
      keys: "ZETA_DESARROLLADOR_CODIGO | ZETA_DEVELOPER_CODE",
    });
  }
  if (!desarrolladorClave.value) {
    missing.push({
      label: "desarrollador clave",
      keys: "ZETA_DESARROLLADOR_CLAVE | ZETA_DEVELOPER_KEY",
    });
  }
  if (!empresaCodigo.value) {
    missing.push({
      label: "empresa codigo",
      keys: "ZETA_EMPRESA_CODIGO | ZETA_COMPANY_CODE",
    });
  }
  if (!empresaClave.value) {
    missing.push({
      label: "empresa clave",
      keys: "ZETA_EMPRESA_CLAVE | ZETA_COMPANY_KEY",
    });
  }

  if (missing.length) {
    const detalle = missing
      .map((m) => `${m.label} (ninguna de: ${m.keys})`)
      .join("; ");
    throw new ZetaConfigurationError(
      `Variables de entorno Zeta faltantes tras fallback B→A: ${detalle}.`
    );
  }

  logDevZetaEnvResolution([
    { key: "empresa_codigo", format: empresaCodigo.format },
    { key: "empresa_clave", format: empresaClave.format },
    { key: "desarrollador_codigo", format: desarrolladorCodigo.format },
    { key: "desarrollador_clave", format: desarrolladorClave.format },
    { key: "rol_codigo", format: rolFormat },
  ]);

  const credentials: ZetaStaticCredentials = {
    desarrolladorCodigo: desarrolladorCodigo.value as string,
    desarrolladorClave: desarrolladorClave.value as string,
    empresaCodigo: empresaCodigo.value as string,
    empresaClave: empresaClave.value as string,
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

// ---------------------------------------------------------------------------
// ZETA-17: Config por workspace con fallback a env vars
// ---------------------------------------------------------------------------

/**
 * Carga config Zeta para un workspace específico.
 *
 * Estrategia:
 *   1) Intenta leer credenciales desde `workspace_integrations` en DB.
 *   2) Si no hay row activa o las creds están incompletas → fallback a env vars.
 *
 * Esto permite onboarding de nuevos clientes sin re-deploy:
 * basta con insertar una fila en `workspace_integrations`.
 *
 * Backward compatible: `loadZetaServerConfig()` sin argumento sigue funcionando.
 *
 * @param workspaceCompanyId - UUID de `public.companies`. Si undefined, usa env vars.
 */
export async function loadZetaServerConfigForWorkspace(
  workspaceCompanyId: string | undefined
): Promise<{
  baseUrl: string;
  credentials: ZetaStaticCredentials;
  timeoutMs: number;
  maxRetries: number;
  source: "db" | "env";
}> {
  const baseUrl = (process.env.ZETA_API_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, "");
  const timeoutMs = Math.min(
    120_000,
    Math.max(5_000, Number(process.env.ZETA_REQUEST_TIMEOUT_MS) || 30_000)
  );
  const maxRetries = Math.min(
    6,
    Math.max(0, Math.floor(Number(process.env.ZETA_MAX_RETRIES) || 3))
  );

  // Intentar credenciales desde DB si tenemos workspaceCompanyId
  if (workspaceCompanyId) {
    const dbCreds = await loadZetaCredentialsFromDb(workspaceCompanyId);
    if (dbCreds) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[zeta-config] workspace ${workspaceCompanyId}: credenciales desde DB`);
      }
      return { baseUrl, credentials: dbCreds, timeoutMs, maxRetries, source: "db" };
    }
  }

  // Fallback a env vars (comportamiento original, nunca rompe)
  const envConfig = loadZetaServerConfig();
  return { ...envConfig, source: "env" };
}
