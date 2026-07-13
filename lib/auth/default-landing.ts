/**
 * USER-ACCESS-LANDING-PERMISSIONS-001 — única fuente de verdad del destino
 * post-login / landing por defecto de Copilot.
 *
 * Regla:
 * - Administrador (superadmin / acceso total) → siempre /copilot/hoy.
 * - Resto de usuarios → primer módulo accesible en el orden de fallback
 *   (Tareas diarias primero, como landing operativa estándar).
 * - Sin acceso a ningún módulo del fallback → /copilot/clientes.
 *
 * No depender solo de email: usa `role` (vía `isSuperAdmin`) + permisos
 * efectivos por módulo. Debe llamarse desde un único lugar por cada
 * superficie de entrada (login, redirects de raíz, middleware) — no
 * duplicar esta lógica.
 */

import { isSuperAdmin } from "@/lib/auth/permissions";
import type { ModuleKey } from "@/lib/auth/module-permissions";

export const ADMIN_LANDING_PATH = "/copilot/hoy";
export const OPERATIONAL_LANDING_PATH = "/copilot/tareas-diarias";
/**
 * Fallback seguro final: ningún módulo del orden de fallback es accesible.
 * Debe ser una ruta SIN gate de módulo (no aparece en
 * COPILOT_MODULE_ROUTE_PREFIXES de proxy.ts) para garantizar que nunca haya
 * loop de redirect, incluso si un usuario quedara sin acceso a nada.
 */
export const NO_ACCESS_LANDING_PATH = "/copilot/alertas";

const LANDING_FALLBACK_ORDER: ReadonlyArray<{ moduleKey: ModuleKey; path: string }> = [
  { moduleKey: "daily_tasks", path: OPERATIONAL_LANDING_PATH },
  { moduleKey: "clientes", path: "/copilot/clientes" },
  { moduleKey: "cartera", path: "/copilot/cartera" },
  { moduleKey: "bank_movements", path: "/copilot/movimientos-bancarios" },
  { moduleKey: "tesoreria", path: "/copilot/tesoreria" },
  { moduleKey: "finanzas", path: "/copilot/finanzas" },
  { moduleKey: "reportes", path: "/copilot/reportes" },
];

function hasReadAccess(level: string | undefined): boolean {
  return level === "read" || level === "write" || level === "admin";
}

/**
 * Destino post-login / landing por defecto para un usuario.
 *
 * `modulePermissions`: mapa module_key → access_level. Puede venir de
 * permisos efectivos resueltos contra DB (server/cliente) o del preset
 * puro del rol (Edge, sin round-trip) — la función es agnóstica a la
 * fuente, solo necesita el mapa final.
 */
export function getDefaultLandingForUser(
  role: string,
  modulePermissions: Readonly<Record<string, string>>
): string {
  if (isSuperAdmin(role)) return ADMIN_LANDING_PATH;
  for (const item of LANDING_FALLBACK_ORDER) {
    if (hasReadAccess(modulePermissions[item.moduleKey])) return item.path;
  }
  return NO_ACCESS_LANDING_PATH;
}
