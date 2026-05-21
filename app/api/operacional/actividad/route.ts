import { NextRequest, NextResponse } from "next/server";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { getOrRefreshActivitySnapshot } from "@/lib/operacional/oic-snapshot-service";
import { isOicEnabled } from "@/lib/operacional/oic-feature-flag";
import type { OicApiResponse, OicPipelineActivityData } from "@/lib/operacional/types";

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

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const snapshot = await getOrRefreshActivitySnapshot(supabase, workspaceCompanyId);
    const data = snapshot.payload as unknown as OicPipelineActivityData;

    return NextResponse.json({
      ok: true,
      data,
      computedAt: snapshot.updated_at,
    } satisfies OicApiResponse<OicPipelineActivityData>);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false, code: "UNEXPECTED", error: message } satisfies OicApiResponse<never>,
      { status: 500 }
    );
  }
}
