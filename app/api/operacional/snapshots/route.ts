import { NextRequest, NextResponse } from "next/server";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { listRecentOicSnapshots } from "@/lib/operacional/oic-snapshot-service";
import { isOicEnabled } from "@/lib/operacional/oic-feature-flag";
import type { OicApiResponse, OicSnapshotSummary } from "@/lib/operacional/types";

export async function GET(request: NextRequest) {
  if (!isOicEnabled()) {
    return NextResponse.json(
      { ok: false, code: "FEATURE_DISABLED", error: "OIC no habilitado." } satisfies OicApiResponse<never>,
      { status: 404 }
    );
  }

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const workspaceCompanyId = auth.ctx.tenantCompanyId.trim();
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const data = await listRecentOicSnapshots(supabase, workspaceCompanyId, limit);

    return NextResponse.json({
      ok: true,
      data,
      computedAt: new Date().toISOString(),
    } satisfies OicApiResponse<OicSnapshotSummary[]>);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false, code: "UNEXPECTED", error: message } satisfies OicApiResponse<never>,
      { status: 500 }
    );
  }
}
