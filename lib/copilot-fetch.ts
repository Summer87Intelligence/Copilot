/**
 * Cliente fetch para rutas `/api/copilot/*` protegidas por sesión (Supabase cookies).
 * Usa `credentials: "include"` por defecto para no depender del default del runtime
 * y mantener cookies en escenarios same-site / proxies.
 */
export function copilotApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? "include",
  });
}
