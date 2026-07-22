import { NextResponse, type NextRequest } from "next/server";

import {
  COPILOT_SESSION_COOKIE,
  isValidCopilotSessionCookieAsync,
  parseCopilotSessionValueAsync,
} from "@/lib/copilot-session-cookie-edge";
import { isReadOnlyRole, isSuperAdmin } from "@/lib/auth/permissions";
import { shouldBlockReadOnlyApiMutation } from "@/lib/auth/read-only-post-allowed";
import { getDefaultPermissionsForRole } from "@/lib/auth/role-permission-presets";
import { getDefaultLandingForUser } from "@/lib/auth/default-landing";
import {
  isZetaApiPath,
  isZetaCronAuthorized,
  zetaApiUnauthenticatedResponse,
} from "@/lib/integrations/zeta/zeta-api-auth-edge";

/** Preset del rol como Record module_key → access_level (Edge, sin DB). */
function presetPermissionsRecord(role: string): Record<string, string> {
  return Object.fromEntries(
    getDefaultPermissionsForRole(role).map((p) => [p.moduleKey, p.accessLevel])
  );
}

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

/**
 * Páginas privadas adicionales fuera de `/copilot/*` que también requieren
 * sesión válida. Agregado en FASE 1 de remediación: las pages SSR `/admin/*`
 * y `/account` se renderizaban para anónimos (las APIs sí cerraban, pero el
 * shell quedaba expuesto). Sin cambios de lógica de auth.
 */
function isExtraProtectedPagePath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/account" ||
    pathname.startsWith("/account/")
  );
}

/**
 * Protege `/copilot` y `/api/copilot/*` con cookie HttpOnly `copilot_session`
 * firmada (HMAC-SHA256); sin Supabase Auth en Edge).
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isAuthPublicPath(pathname)) {
    return NextResponse.next();
  }

  // /api/zeta/* — cookie válida o Bearer CRON_SECRET; nunca anónimo.
  if (isZetaApiPath(pathname)) {
    if (isZetaCronAuthorized(request)) {
      return NextResponse.next();
    }
    const zetaSession = request.cookies.get(COPILOT_SESSION_COOKIE)?.value;
    if (!(await isValidCopilotSessionCookieAsync(zetaSession))) {
      return zetaApiUnauthenticatedResponse();
    }
    return NextResponse.next();
  }

  if (isCopilotProtectedPath(pathname)) {
    const sessionCookieValue = request.cookies.get(COPILOT_SESSION_COOKIE)?.value;
    if (!(await isValidCopilotSessionCookieAsync(sessionCookieValue))) {
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
      const parsed = await parseCopilotSessionValueAsync(sessionCookieValue);
      if (!parsed || !isSuperAdmin(parsed.role ?? "")) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { ok: false, error: "FORBIDDEN", message: "Solo superadmin puede acceder a esta sección." },
            { status: 403 }
          );
        }
        const role = parsed?.role ?? "";
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = getDefaultLandingForUser(role, presetPermissionsRecord(role));
        redirectUrl.searchParams.set("blocked", "admin-access");
        return NextResponse.redirect(redirectUrl);
      }
    }

    // Guard de módulo por página: NO se resuelve acá. El preset del rol (sin
    // DB) no refleja los overrides explícitos de app_user_permissions que
    // guarda Configuración, así que bloquear en Edge contra el preset produce
    // falsos negativos — un admin habilita Banco (u otro módulo) para un
    // usuario, el override se persiste correctamente, pero el preset del rol
    // sigue diciendo 'none' y este middleware redirigía igual (RBAC-BANK-
    // ACCESS-URGENT-FIX-001). Cada página bajo /copilot/* ya resuelve su
    // propio guard server-side contra permisos efectivos reales (preset +
    // overrides DB) vía isModuleAccessDenied()/getServerEffectivePermissions()
    // — ver lib/auth/server-module-permissions.ts — y es la única fuente de
    // verdad para "puede ver este módulo". No duplicar ese chequeo acá.
  }

  // FASE 1 — Cerrar acceso anónimo SSR en /admin/* y /account.
  // Sin permisos por módulo acá: las APIs admin (que ya validan superadmin)
  // siguen siendo el gate real para datos; este bloque solo evita que la
  // page se renderice sin sesión válida.
  if (isExtraProtectedPagePath(pathname)) {
    const sessionCookieValue = request.cookies.get(COPILOT_SESSION_COOKIE)?.value;
    if (!(await isValidCopilotSessionCookieAsync(sessionCookieValue))) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    // /admin/* — solo superadmin (mismo criterio que /copilot/admin).
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const parsed = await parseCopilotSessionValueAsync(sessionCookieValue);
      if (!parsed || !isSuperAdmin(parsed.role ?? "")) {
        const role = parsed?.role ?? "";
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = getDefaultLandingForUser(role, presetPermissionsRecord(role));
        redirectUrl.searchParams.set("blocked", "admin-access");
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  // Block ALL write operations for read-only demo role across EVERY /api/* prefix
  // (intentionally outside isCopilotProtectedPath so /api/zeta/*, etc. are also covered)
  if (pathname.startsWith("/api/")) {
    const sessionCookieValue = request.cookies.get(COPILOT_SESSION_COOKIE)?.value;
    if (sessionCookieValue && (await isValidCopilotSessionCookieAsync(sessionCookieValue))) {
      const parsed = await parseCopilotSessionValueAsync(sessionCookieValue);
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
