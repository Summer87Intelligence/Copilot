/**
 * POST permitidos para roles read-only (usuario / demo_readonly).
 * Solo operaciones que no persisten datos; el guard fino vive en cada route handler.
 */

export const READ_ONLY_ALLOWED_POST_PATHS = [
  "/api/copilot/collection-actions/batch",
  "/api/copilot/treasury/bank-reconciliation-movements/parse",
  "/api/copilot/treasury/bank-reconciliation-movements/import",
] as const;

export function isReadOnlyPostAllowedPath(pathname: string): boolean {
  return (READ_ONLY_ALLOWED_POST_PATHS as readonly string[]).includes(pathname);
}

const PUBLIC_AUTH_API_PATHS = [
  "/api/copilot/login",
  "/api/copilot/logout",
] as const;

function isPublicAuthApiPath(pathname: string): boolean {
  return PUBLIC_AUTH_API_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * true => bloquear con 403 (mutación no permitida para read-only).
 */
export function shouldBlockReadOnlyApiMutation(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/")) return false;

  const verb = method.toUpperCase();
  const isMutation =
    verb === "POST" || verb === "PUT" || verb === "PATCH" || verb === "DELETE";
  if (!isMutation) return false;
  if (isPublicAuthApiPath(pathname)) return false;
  if (isReadOnlyPostAllowedPath(pathname)) return false;
  return true;
}
