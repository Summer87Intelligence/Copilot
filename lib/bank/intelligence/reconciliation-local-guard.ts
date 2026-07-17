/**
 * FASE BANK-LOCAL-POSTGRES-VALIDATION-001 — Guard de seguridad para el harness local.
 *
 * La validación de migraciones/RPC SOLO puede correr contra un PostgreSQL LOCAL/efímero.
 * Este guard RECHAZA cualquier URL que apunte a Supabase remoto o a un host no-local,
 * para que el harness nunca ejecute DDL/DML contra el proyecto real por accidente.
 */

const REMOTE_MARKERS = ["supabase.co", "supabase.in", "pooler.supabase", "erzdifkvvailxnwdukzf"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function isLocalSafePgUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (REMOTE_MARKERS.some((m) => host.includes(m))) return false;
  if (LOCAL_HOSTS.has(host)) return true;
  // Nombres de servicio Docker cortos sin punto (sin dominio) se consideran locales.
  return !host.includes(".");
}

/** Lanza si la URL no es local segura. Úsese antes de cualquier conexión. */
export function assertLocalPgUrl(raw: string | undefined | null): string {
  if (!isLocalSafePgUrl(raw)) {
    throw new Error(
      "LOCAL_PG_URL ausente o no-local. El harness de validación solo corre contra un " +
        "PostgreSQL local/efímero (localhost/127.0.0.1 o host de contenedor). Rechazado por seguridad."
    );
  }
  return raw as string;
}
