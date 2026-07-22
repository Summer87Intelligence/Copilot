import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedAppUser = {
  id: string;
  fullName: string | null;
  email: string | null;
  /** Nombre → email → "Usuario del sistema". Nunca UUID como texto principal. */
  label: string;
};

/**
 * Resuelve actores de app_users en un solo `.in()` (sin N+1).
 * Usado por Historial de identificaciones y Cliente 360.
 */
export async function resolveAppUsersById(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, ResolvedAppUser>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const out = new Map<string, ResolvedAppUser>();
  if (unique.length === 0) return out;

  const { data, error } = await supabase.from("app_users").select("id, full_name, email").in("id", unique);
  if (error) throw new Error(`RESOLVE_APP_USERS_FAILED: ${error.message}`);

  for (const row of data ?? []) {
    const id = row.id as string;
    const fullName = typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : null;
    const email = typeof row.email === "string" && row.email.trim() ? row.email.trim() : null;
    out.set(id, {
      id,
      fullName,
      email,
      label: fullName ?? email ?? "Usuario del sistema",
    });
  }

  for (const id of unique) {
    if (!out.has(id)) {
      out.set(id, { id, fullName: null, email: null, label: "Usuario del sistema" });
    }
  }
  return out;
}
