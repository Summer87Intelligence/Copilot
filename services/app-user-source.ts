import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase-client";
import type { AppUser } from "@/types/app-user";

const APP_USER_COLUMNS = "id, company_id, full_name, email, role, created_at" as const;

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
 * SEC-03: Busca un usuario de negocio por auth.uid() (auth_user_id).
 * Método principal post-migración SEC-03-01. Más seguro que el lookup por email
 * porque no se rompe si el usuario cambia su email en Supabase Auth.
 */
export async function getAppUserByAuthUid(
  authUid: string,
  client: SupabaseClient = supabase
): Promise<AppUser | null> {
  if (!authUid?.trim()) return null;

  const { data, error } = await client
    .from("app_users")
    .select(APP_USER_COLUMNS)
    .eq("auth_user_id", authUid)
    .maybeSingle();

  if (error || !data) return null;
  return mapRowToAppUser(data);
}

/**
 * Busca un usuario de negocio en `app_users` por email.
 * Usado como fallback durante la transición a auth.uid() (SEC-03).
 * Primero intenta coincidencia exacta; si no hay fila, intenta case-insensitive.
 */
export async function getAppUserByEmail(
  email: string,
  client: SupabaseClient = supabase
): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const exact = await client
    .from("app_users")
    .select(APP_USER_COLUMNS)
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
    .select(APP_USER_COLUMNS)
    .ilike("email", normalized)
    .maybeSingle();

  if (ci.error || !ci.data) {
    return null;
  }

  return mapRowToAppUser(ci.data);
}
