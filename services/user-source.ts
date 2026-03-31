import { supabase } from "@/lib/supabase-client";
import type { AppUser } from "@/types/app-user";

const DEMO_USER_EMAIL = "demo@summer87.com";

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
 * Usuario demo (`demo@summer87.com`). Sin uso en UI ni auth por ahora.
 */
export async function getDemoUser(): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, company_id, full_name, email, role, created_at")
    .eq("email", DEMO_USER_EMAIL)
    .single();

  if (error || !data) {
    return null;
  }

  return mapRowToAppUser(data);
}
