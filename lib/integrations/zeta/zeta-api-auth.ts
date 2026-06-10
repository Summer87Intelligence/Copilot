import { NextRequest } from "next/server";

import { isSuperAdmin } from "@/lib/auth/permissions";
import {
  requireCopilotTenantContext,
  type CopilotAuthResult,
  type CopilotTenantContext,
} from "@/lib/copilot-api-auth";

export {
  ZETA_API_PATH_PREFIX,
  ZETA_CRON_AUTH_ROUTES,
  isZetaApiPath,
  isZetaCronAuthRoute,
  isZetaCronAuthorized,
  zetaApiUnauthenticatedResponse,
  zetaCronUnauthorizedResponse,
  zetaForbiddenSuperAdminResponse,
} from "@/lib/integrations/zeta/zeta-api-auth-edge";

import {
  isZetaCronAuthorized,
  zetaCronUnauthorizedResponse,
  zetaForbiddenSuperAdminResponse,
} from "@/lib/integrations/zeta/zeta-api-auth-edge";

export type ZetaCronAuthResult =
  | { ok: true }
  | { ok: false; response: ReturnType<typeof zetaCronUnauthorizedResponse> };

export type ZetaSuperAdminAuthResult =
  | { ok: true; ctx: CopilotTenantContext }
  | { ok: false; response: ReturnType<typeof zetaForbiddenSuperAdminResponse> };

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
