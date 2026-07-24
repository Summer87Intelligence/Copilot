import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedAppUser = {
  id: string;
  fullName: string | null;
  email: string | null;
  deletedAt: string | null;
  isActive: boolean | null;
  /**
   * Nombre → email → "Usuario eliminado" → "Usuario del sistema".
   * Nunca UUID como texto principal.
   */
  label: string;
  kind: "user" | "deleted" | "unknown";
};

/**
 * Resuelve actores de app_users en un solo `.in()` (sin N+1).
 * Usado por Historial de identificaciones, importaciones y Cliente 360.
 */
export async function resolveAppUsersById(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, ResolvedAppUser>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const out = new Map<string, ResolvedAppUser>();
  if (unique.length === 0) return out;

  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, email, deleted_at, is_active")
    .in("id", unique);
  if (error) throw new Error(`RESOLVE_APP_USERS_FAILED: ${error.message}`);

  for (const row of data ?? []) {
    const id = row.id as string;
    const fullName = typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : null;
    const email = typeof row.email === "string" && row.email.trim() ? row.email.trim() : null;
    const deletedAt =
      typeof row.deleted_at === "string" && row.deleted_at.trim() ? (row.deleted_at as string) : null;
    const isActive = typeof row.is_active === "boolean" ? row.is_active : null;

    if (deletedAt) {
      out.set(id, {
        id,
        fullName,
        email,
        deletedAt,
        isActive,
        label: "Usuario eliminado",
        kind: "deleted",
      });
      continue;
    }

    out.set(id, {
      id,
      fullName,
      email,
      deletedAt: null,
      isActive,
      label: fullName ?? email ?? "Usuario del sistema",
      kind: fullName || email ? "user" : "unknown",
    });
  }

  for (const id of unique) {
    if (!out.has(id)) {
      out.set(id, {
        id,
        fullName: null,
        email: null,
        deletedAt: null,
        isActive: null,
        label: "Usuario del sistema",
        kind: "unknown",
      });
    }
  }
  return out;
}
