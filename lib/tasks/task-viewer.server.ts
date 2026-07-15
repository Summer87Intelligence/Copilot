/**
 * FASE 7 — Construye el TaskViewer (identidad + permisos efectivos) server-side.
 * Nunca confía en el cliente: los permisos se resuelven desde preset + overrides DB.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadEffectiveModulePermissionsForAppUser } from "@/lib/auth/copilot-module-api-auth";
import type { TaskViewer } from "@/lib/tasks/task-visibility";
import type { AppUser } from "@/types/app-user";

export async function buildTaskViewer(
  supabase: SupabaseClient,
  appUser: AppUser
): Promise<TaskViewer> {
  const permissions = await loadEffectiveModulePermissionsForAppUser(supabase, appUser);
  return {
    userId: appUser.id,
    role: String(appUser.role ?? ""),
    permissions,
  };
}
