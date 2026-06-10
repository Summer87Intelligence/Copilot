import { NextRequest, NextResponse } from "next/server";

import { isSuperAdmin } from "@/lib/auth/permissions";
import {
  requireCopilotTenantContext,
  type CopilotAuthResult,
  type CopilotTenantContext,
} from "@/lib/copilot-api-auth";

export const ZETA_API_PATH_PREFIX = "/api/zeta/";

/** Rutas /api/zeta/* que aceptan Bearer CRON_SECRET sin cookie de sesión. */
export const ZETA_CRON_AUTH_ROUTES = ["/api/zeta/sync-installments-backfill"] as const;

export type ZetaCronAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export type ZetaSuperAdminAuthResult =
  | { ok: true; ctx: CopilotTenantContext }
  | { ok: false; response: NextResponse };

export function isZetaApiPath(pathname: string): boolean {
  return pathname.startsWith(ZETA_API_PATH_PREFIX);
}

export function isZetaCronAuthRoute(pathname: string): boolean {
  return ZETA_CRON_AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function isZetaCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function zetaApiUnauthenticatedResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false as const,
      code: "UNAUTHENTICATED",
      message: "Tenés que iniciar sesión o usar Bearer CRON_SECRET.",
    },
    { status: 401 }
  );
}

export function zetaCronUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false as const,
      code: "UNAUTHORIZED",
      message: "Bearer CRON_SECRET inválido o no configurado.",
    },
    { status: 401 }
  );
}

export function zetaForbiddenSuperAdminResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false as const,
      code: "FORBIDDEN",
      message: "Solo superadmin puede acceder a este endpoint.",
    },
    { status: 403 }
  );
}

export function requireZetaCronAuth(request: NextRequest): ZetaCronAuthResult {
  if (!isZetaCronAuthorized(request)) {
    return { ok: false, response: zetaCronUnauthorizedResponse() };
  }
  return { ok: true };
}

/** Sincronización / import manual tenant-scoped. */
export async function requireZetaCopilotAuth(
  request: NextRequest,
  body?: unknown
): Promise<CopilotAuthResult> {
  return requireCopilotTenantContext(request, body);
}

/** Diagnóstico Zeta: solo superadmin autenticado. */
export async function requireZetaSuperAdminAuth(
  request: NextRequest,
  body?: unknown
): Promise<ZetaSuperAdminAuthResult> {
  const auth = await requireCopilotTenantContext(request, body);
  if (!auth.ok) return auth;

  if (!isSuperAdmin(auth.ctx.appUser.role)) {
    return { ok: false, response: zetaForbiddenSuperAdminResponse() };
  }

  return auth;
}
