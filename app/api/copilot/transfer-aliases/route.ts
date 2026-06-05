import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";

/**
 * GET /api/copilot/transfer-aliases
 * Returns all active aliases for the workspace, keyed by company_id.
 * Used by the clients list page to enable alias-based search/display.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    const { supabase, tenantCompanyId } = auth.ctx;

    const { data, error } = await supabase
      .from("client_transfer_aliases")
      .select("id, company_id, label")
      .eq("workspace_id", tenantCompanyId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(20000);

    if (error) {
      return NextResponse.json({ ok: false, error: "Error al cargar aliases." }, { status: 500 });
    }

    // Group labels by company_id for efficient client-side lookup
    const byCompany: Record<string, string[]> = {};
    for (const row of data ?? []) {
      const r = row as { company_id: string; label: string };
      if (!byCompany[r.company_id]) byCompany[r.company_id] = [];
      byCompany[r.company_id].push(r.label);
    }

    return NextResponse.json({ ok: true, byCompany });
  } catch {
    return NextResponse.json({ ok: false, error: "Error interno." }, { status: 500 });
  }
}
