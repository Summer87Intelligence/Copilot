import { NextResponse, type NextRequest } from "next/server";

import {
  COPILOT_SESSION_COOKIE,
  isValidCopilotSessionCookie,
  parseCopilotSessionValue,
} from "@/lib/copilot-session-cookie";
import { isReadOnlyRole, isSuperAdmin } from "@/lib/auth/permissions";
import { shouldBlockReadOnlyApiMutation } from "@/lib/auth/read-only-post-allowed";

/** Rutas del módulo Copilot y APIs (excepto login/logout públicos). */
function isCopilotProtectedPath(pathname: string): boolean {
  if (
    pathname === "/api/copilot/login" ||
    pathname.startsWith("/api/copilot/login/") ||
    pathname === "/api/copilot/logout" ||
    pathname.startsWith("/api/copilot/logout/")
  ) {
    return false;
  }
  return (
    pathname === "/copilot" ||
    pathname.startsWith("/copilot/") ||
    pathname.startsWith("/api/copilot/") ||
    pathname.startsWith("/api/operacional/")
  );
}

/** Rutas de autenticación públicas. */
function isAuthPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/auth/confirm" ||
    pathname.startsWith("/auth/confirm/")
  );
}

function hasValidCopilotSession(request: NextRequest): boolean {
  const v = request.cookies.get(COPILOT_SESSION_COOKIE)?.value;
  return isValidCopilotSessionCookie(v);
}

/**
 * Protege `/copilot` y `/api/copilot/*` con cookie HttpOnly `copilot_session`
 * (valor `{uuid}:{role}:{companyId}` o legado `{uuid}:{role}`; sin Supabase Auth en Edge).
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isAuthPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isCopilotProtectedPath(pathname)) {
    const sessionCookieValue = request.cookies.get(COPILOT_SESSION_COOKIE)?.value;
    if (!isValidCopilotSessionCookie(sessionCookieValue)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }

    // /copilot/admin y /api/copilot/admin/* son exclusivos de superadmin
    const isAdminPath =
      pathname === "/copilot/admin" ||
      pathname.startsWith("/copilot/admin/") ||
      pathname.startsWith("/api/copilot/admin");

    if (isAdminPath) {
      const parsed = parseCopilotSessionValue(sessionCookieValue);
      if (!parsed || !isSuperAdmin(parsed.role ?? "")) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { ok: false, error: "FORBIDDEN", message: "Solo superadmin puede acceder a esta sección." },
            { status: 403 }
          );
        }
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/copilot/hoy";
        redirectUrl.searchParams.set("blocked", "admin-access");
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  // Block ALL write operations for read-only demo role across EVERY /api/* prefix
  // (intentionally outside isCopilotProtectedPath so /api/zeta/*, etc. are also covered)
  if (pathname.startsWith("/api/")) {
    const sessionCookieValue = request.cookies.get(COPILOT_SESSION_COOKIE)?.value;
    if (sessionCookieValue && isValidCopilotSessionCookie(sessionCookieValue)) {
      const parsed = parseCopilotSessionValue(sessionCookieValue);
      if (parsed && isReadOnlyRole(parsed.role)) {
        if (shouldBlockReadOnlyApiMutation(pathname, request.method)) {
          return NextResponse.json(
            {
              ok: false,
              error: "READ_ONLY_USER",
              message: "Este usuario es solo lectura. Solo un superadmin puede modificar datos.",
            },
            { status: 403 }
          );
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
