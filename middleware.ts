import { NextResponse, type NextRequest } from "next/server";

import {
  COPILOT_SESSION_COOKIE,
  isValidCopilotSessionCookie,
} from "@/lib/copilot-session-cookie";

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
    if (!hasValidCopilotSession(request)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
