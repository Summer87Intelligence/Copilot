import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase con sesión del usuario (cookies) para Route Handlers y Server Actions.
 * Usa la anon key; las políticas RLS de Supabase aplican según el JWT.
 */
export async function createRouteSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
        ) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Algunas rutas no permiten mutar cookies; la lectura de sesión sigue funcionando.
          }
        },
      },
    }
  );
}
