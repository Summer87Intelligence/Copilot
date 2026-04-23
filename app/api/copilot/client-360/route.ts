import { NextRequest, NextResponse } from "next/server";

import { loadClientCompany360 } from "@/lib/copilot-client-360";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

/**
 * GET /api/copilot/client-360?companyId=<uuid>
 * Solo lectura en Postgres (proto_* + zeta_sync_state); no Zeta.
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant_client_360" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false as const, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const companyId = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";
    if (!companyId) {
      return NextResponse.json(
        { ok: false as const, code: "BAD_REQUEST", error: "Falta companyId." },
        { status: 400 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabaseForData =
      !supabaseUserErr && supabaseUserData.user ? supabaseFromCookies : auth.ctx.supabase;

    const payload = await loadClientCompany360(supabaseForData, tenantCompanyId, companyId);
    if (!payload) {
      return NextResponse.json(
        { ok: false as const, code: "NOT_FOUND", error: "Cliente no encontrado en este workspace." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true as const, payload });
  } catch (e) {
    log.error("copilot_client_360_failed", e, { route: "GET /api/copilot/client-360" });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", error: message },
      { status: 500 }
    );
  }
}
