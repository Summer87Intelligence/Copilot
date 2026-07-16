import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import {
  COPILOT_SESSION_COOKIE,
  parseCopilotSessionValue,
} from "@/lib/copilot-session-cookie";
import { getDefaultPermissionsForRole } from "@/lib/auth/role-permission-presets";
import {
  resolveEffectivePermissions,
  type ModuleKey,
  type AccessLevel,
  type ModulePermission,
} from "@/lib/auth/module-permissions";

export type ModulePermissionsMap = Record<ModuleKey, AccessLevel>;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Obtiene los permisos efectivos del usuario actual (preset + overrides de DB).
 * Usa React cache() para deduplicar la consulta dentro del mismo request
 * (layout + páginas comparten el resultado sin doble round-trip a Supabase).
 * Devuelve null si no hay sesión válida o si los env vars están ausentes.
 */
export const getServerEffectivePermissions = cache(
  async (): Promise<ModulePermissionsMap | null> => {
    const cookieStore = await cookies();
    const parsed = parseCopilotSessionValue(
      cookieStore.get(COPILOT_SESSION_COOKIE)?.value
    );
    if (!parsed) return null;

    const admin = createServiceClient();
    if (!admin) return null;

    const { data: userRow } = await admin
      .from("app_users")
      .select("id, company_id, role")
      .eq("id", parsed.userId)
      .maybeSingle();

    if (!userRow) return null;

    const r = userRow as { id: string; company_id: string | null; role: string };
    const role = String(r.role ?? "").trim();
    const userId = r.id;
    const workspaceId = String(r.company_id ?? "").trim();
    if (!workspaceId) return null;

    const { data: overrideRows } = await admin
      .from("app_user_permissions")
      .select("module_key, access_level")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);

    const presets = getDefaultPermissionsForRole(role);
    const overrides: ModulePermission[] = ((overrideRows ?? []) as Array<{ module_key: string; access_level: string }>)
      .filter((row) => typeof row.module_key === "string" && typeof row.access_level === "string")
      .map((row) => ({
        moduleKey: row.module_key as ModuleKey,
        accessLevel: row.access_level as AccessLevel,
      }));

    const effective = resolveEffectivePermissions(role, presets, overrides);
    return Object.fromEntries(
      effective.map((p) => [p.moduleKey, p.accessLevel])
    ) as ModulePermissionsMap;
  }
);

/**
 * True si el usuario NO tiene acceso de lectura al módulo indicado.
 * Usar en server component pages: if (await isModuleAccessDenied("tesoreria")) return <AccessDeniedCard />;
 *
 * Fail-closed: si no hay sesión válida, devuelve true. El gate principal sigue
 * siendo `middleware.ts` (redirige a /login antes de llegar acá); este check
 * actúa como defensa en profundidad — si por algún motivo la página se
 * renderiza sin sesión (p.ej. matcher mal configurado), muestra AccessDeniedCard
 * en lugar de exponer el módulo.
 */
export async function isModuleAccessDenied(moduleKey: ModuleKey): Promise<boolean> {
  const perms = await getServerEffectivePermissions();
  if (!perms) return true;
  return (perms[moduleKey] ?? "none") === "none";
}

/** True si el usuario tiene nivel admin sobre el módulo (gestión de catálogo, etc.). */
export async function hasModuleAdminAccess(moduleKey: ModuleKey): Promise<boolean> {
  const perms = await getServerEffectivePermissions();
  if (!perms) return false;
  return (perms[moduleKey] ?? "none") === "admin";
}
