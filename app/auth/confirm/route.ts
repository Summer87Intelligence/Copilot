import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

/** Solo rutas relativas internas (evita open redirect). */
function safeNextPath(raw: string | null): string {
  if (raw == null || typeof raw !== "string") return "/copilot/rutas";
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/copilot/rutas";
  return t;
}

const OTP_TYPES = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function parseOtpType(type: string | null): string | null {
  if (!type || !OTP_TYPES.has(type)) return null;
  return type;
}

/**
 * GET /auth/confirm
 * Intercambia el magic link (PKCE `code` o `token_hash` + `type`) por sesión
 * y escribe cookies en la **respuesta** del redirect (SSR).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const redirectSuccess = NextResponse.redirect(new URL(nextPath, url.origin));
  const redirectLogin = NextResponse.redirect(new URL("/login", url.origin));

  const applyCookiesTo = (res: NextResponse) => {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options);
            });
          },
        },
      }
    );
    return supabase;
  };

  const code = url.searchParams.get("code");
  if (code) {
    const supabase = applyCookiesTo(redirectSuccess);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectLogin;
    }
    return redirectSuccess;
  }

  const token_hash = url.searchParams.get("token_hash");
  const type = parseOtpType(url.searchParams.get("type"));
  if (token_hash && type) {
    const supabase = applyCookiesTo(redirectSuccess);
    const { error } = await supabase.auth.verifyOtp({
      type: type as
        | "signup"
        | "invite"
        | "magiclink"
        | "recovery"
        | "email_change"
        | "email",
      token_hash,
    });
    if (error) {
      return redirectLogin;
    }
    return redirectSuccess;
  }

  return redirectLogin;
}
