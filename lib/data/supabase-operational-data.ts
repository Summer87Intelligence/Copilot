import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TEN-02: cliente Supabase ya acotado por sesión (p. ej. route handler tras SEC-01).
 * La autorización de filas sigue siendo RLS (SEC-02); esta capa solo ordena el acceso en código.
 */
export type OperationalSupabase = SupabaseClient;
