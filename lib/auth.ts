import { supabase } from "@/lib/supabase-client";

/**
 * Envía un enlace mágico al email (Supabase Auth OTP por email).
 */
export async function signInWithMagicLink(email: string): Promise<{
  error: Error | null;
}> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: new Error("Ingresá un email válido.") };
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : undefined;

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: origin
        ? `${origin}/auth/confirm?next=${encodeURIComponent("/copilot/rutas")}`
        : undefined,
    },
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}
