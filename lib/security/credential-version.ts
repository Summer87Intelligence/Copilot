/**
 * SECURITY-02: incremento de `credential_version` para invalidar cookies existentes.
 * Llamar desde rutas admin / scripts al rotar PIN (sin UI en esta fase).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function bumpUserCredentialVersion(
  admin: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: row, error: selErr } = await admin
    .from("app_users")
    .select("credential_version")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    return { ok: false, message: selErr.message };
  }
  if (!row) {
    return { ok: false, message: "user_not_found" };
  }

  const current = Number((row as { credential_version?: unknown }).credential_version ?? 1);
  const next = Number.isFinite(current) ? current + 1 : 2;

  const { error: updErr } = await admin
    .from("app_users")
    .update({
      credential_version: next,
      credentials_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updErr) {
    return { ok: false, message: updErr.message };
  }
  return { ok: true };
}
