import type { User } from "@supabase/supabase-js";

import type { AppUser } from "@/types/app-user";

/**
 * Usuario autenticado en Supabase Auth vinculado (o no) a `app_users`.
 * `companyId` es la empresa de negocio cuando existe fila en `app_users`.
 */
export type AuthenticatedAppUserContext = {
  authUser: User;
  appUser: AppUser | null;
  companyId: string | null;
};

/** `null` = sesión ausente; con sesión siempre hay `authUser`. */
export type CurrentAppUserContext = AuthenticatedAppUserContext | null;
