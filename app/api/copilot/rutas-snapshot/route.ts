import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { buildCopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabase =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const data = await buildCopilotRutasSnapshot(supabase, auth.ctx.tenantCompanyId);
    return NextResponse.json({ ok: true as const, data });
  } catch (error) {
    log.error("copilot_request_unhandled", error, {
      route: "GET /api/copilot/rutas-snapshot",
    });
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      {
        ok: false as const,
        code: "UNEXPECTED",
        message,
      },
      { status: 500 }
    );
  }
}
