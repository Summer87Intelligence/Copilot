import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase-client";
import { getAppUserByEmail } from "@/services/app-user-source";
import type { CurrentAppUserContext } from "@/types/current-user-context";

/**
 * Usuario de Supabase Auth en el cliente actual (sesión + JWT).
 * No usa service role; respeta RLS con la anon key.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

/** Alias explícito para llamadas que prefieren el nombre `fetch`. */
export const fetchCurrentUser = getCurrentUser;

/**
 * Contexto listo para multiempresa: auth + fila `app_users` + `companyId` si aplica.
 */
export async function getCurrentAppUserContext(): Promise<CurrentAppUserContext> {
  const authUser = await getCurrentUser();
  if (!authUser) {
    return null;
  }

  const email = authUser.email?.trim();
  if (!email) {
    return { authUser, appUser: null, companyId: null };
  }

  const appUser = await getAppUserByEmail(email);
  if (appUser) {
    return { authUser, appUser, companyId: appUser.company_id };
  }

  return { authUser, appUser: null, companyId: null };
}
