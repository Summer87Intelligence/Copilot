import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { fetchActiveTransferAliasesByWorkspace } from "@/lib/copilot/client-transfer-aliases-query";

/**
 * GET /api/copilot/transfer-aliases
 * Returns all active aliases for the workspace, keyed by company_id.
 * Optional ?companyIds=id1,id2 — aliases only for those clients (batched, no silent 500 cap).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "clientes");
    if (!auth.ok) return auth.response;
    const { supabase, tenantCompanyId } = auth.ctx;

    const rawCompanyIds = request.nextUrl.searchParams.get("companyIds");
    const companyIds = rawCompanyIds
      ? rawCompanyIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;

    const { byCompany, truncated } = await fetchActiveTransferAliasesByWorkspace(
      supabase,
      tenantCompanyId,
      companyIds
    );

    const grouped: Record<string, string[]> = {};
    for (const [companyId, labels] of byCompany.entries()) {
      grouped[companyId] = labels;
    }

    return NextResponse.json({ ok: true, byCompany: grouped, truncated });
  } catch {
    return NextResponse.json({ ok: false, error: "Error interno." }, { status: 500 });
  }
}
