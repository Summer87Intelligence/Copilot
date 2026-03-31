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
 * Busca un usuario de negocio en `app_users` por email (coincidencia exacta).
 */
export async function getAppUserByEmail(
  email: string
): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("id, company_id, full_name, email, role, created_at")
    .eq("email", normalized)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapRowToAppUser(data);
}
