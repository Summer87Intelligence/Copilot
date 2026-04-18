import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cliente Supabase en el navegador: persiste la sesión en **cookies** (vía
 * `@supabase/ssr`), alineado con `createRouteSupabaseClient` en servidor.
 *
 * En entorno sin `window` (RSC, tests en Node, etc.) se usa un cliente anónimo
 * sin persistencia para no romper imports de módulos compartidos.
 */
function createSupabaseForRuntime(): SupabaseClient {
  if (typeof window === "undefined") {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = createSupabaseForRuntime();
