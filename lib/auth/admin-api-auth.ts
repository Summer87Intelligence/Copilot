/**
 * Helper de autenticación para endpoints /api/copilot/admin/*.
 * Todos los endpoints admin requieren rol superadmin + service role client.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";

export type AdminApiContext = {
  admin: SupabaseClient;
  tenantCompanyId: string;
  actorId: string;
};

type AdminAuthSuccess = { ok: true; ctx: AdminApiContext };
type AdminAuthFailure = { ok: false; response: NextResponse };
export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure;

export function createAdminServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Valida sesión + rol superadmin.
 * El middleware ya bloquea rutas admin para no-superadmin, pero esto es defensa en profundidad.
 */
export async function requireAdminContext(
  request: NextRequest
): Promise<AdminAuthResult> {
  const auth = await requireCopilotTenantContext(request);
  if (!auth.ok) return auth;

  if (auth.ctx.appUser.role?.trim().toLowerCase() !== "superadmin") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "FORBIDDEN", message: "Solo superadmin puede acceder a esta sección." },
        { status: 403 }
      ),
    };
  }

  const admin = createAdminServiceClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "Error interno del servidor." },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      admin,
      tenantCompanyId: auth.ctx.tenantCompanyId,
      actorId: auth.ctx.appUser.id,
    },
  };
}
