import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase-client";
import type { AppUser } from "@/types/app-user";

function mapRowToAppUser(row: {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}): AppUser {
  return {
    id: row.id,
    company_id: row.company_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    created_at: row.created_at,
  };
}

/**
 * Busca un usuario de negocio en `app_users` por email.
 * Primero intenta coincidencia exacta con el email normalizado (minúsculas + trim);
 * si no hay fila, intenta coincidencia sin distinguir mayúsculas (RLS sigue aplicando).
 */
export async function getAppUserByEmail(
  email: string,
  client: SupabaseClient = supabase
): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const columns = "id, company_id, full_name, email, role, created_at";

  const exact = await client
    .from("app_users")
    .select(columns)
    .eq("email", normalized)
    .maybeSingle();

  if (exact.error) {
    return null;
  }
  if (exact.data) {
    return mapRowToAppUser(exact.data);
  }

  const ci = await client
    .from("app_users")
    .select(columns)
    .ilike("email", normalized)
    .maybeSingle();

  if (ci.error || !ci.data) {
    return null;
  }

  return mapRowToAppUser(ci.data);
}
