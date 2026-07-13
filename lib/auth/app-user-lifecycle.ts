/**
 * USER-ACCOUNT-DEACTIVATE-VS-DELETE-001 — semántica de desactivar vs eliminar.
 *
 * Desactivar: is_active=false, conserva email/permisos/historial, reversible.
 * Eliminar: soft delete (deleted_at + anonimización), irreversible, FKs intactas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { bumpUserCredentialVersion } from "@/lib/security/credential-version";

export const INACTIVE_ACCOUNT_LOGIN_MESSAGE =
  "Tu cuenta está inactiva. Contactá al administrador.";

export const DELETED_ACCOUNT_LOGIN_MESSAGE =
  "Esta cuenta fue eliminada. Contactá al administrador.";

export type AppUserAccessState = {
  is_active: boolean | null;
  deleted_at: string | null;
};

export function buildDeletedEmailPlaceholder(userId: string): string {
  return `deleted+${userId}@removed.copilot.local`;
}

export function buildDeletedUsernamePlaceholder(userId: string): string {
  return `deleted_${userId.replace(/-/g, "").slice(0, 24)}`;
}

/** Razón por la que no puede iniciar sesión, o null si el acceso está permitido. */
export function loginBlockReason(user: AppUserAccessState): string | null {
  if (user.deleted_at) return DELETED_ACCOUNT_LOGIN_MESSAGE;
  if (user.is_active === false) return INACTIVE_ACCOUNT_LOGIN_MESSAGE;
  return null;
}

export function isAccountLoginAllowed(user: AppUserAccessState): boolean {
  return loginBlockReason(user) === null;
}

export async function countActiveSuperadmins(
  admin: SupabaseClient,
  tenantCompanyId: string
): Promise<number> {
  const { count, error } = await admin
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("company_id", tenantCompanyId)
    .eq("role", "superadmin")
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function isLastActiveSuperadminGuard(
  role: string,
  activeSuperadminCount: number
): boolean {
  return role.toLowerCase() === "superadmin" && activeSuperadminCount <= 1;
}

export async function invalidateUserSessions(
  admin: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return bumpUserCredentialVersion(admin, userId);
}
