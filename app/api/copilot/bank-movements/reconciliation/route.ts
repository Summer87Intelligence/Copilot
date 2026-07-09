import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseReconciliationListFilters } from "@/lib/bank-movements/bank-movement-reconciliation-api";
import { loadBankMovementReconciliationList } from "@/lib/bank-movements/bank-movement-reconciliation-service.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const filters = parseReconciliationListFilters(request.nextUrl.searchParams);

  try {
    const data = await loadBankMovementReconciliationList({
      supabase: auth.ctx.supabase,
      workspaceId: auth.ctx.tenantCompanyId,
      filters,
    });

    return NextResponse.json({
      ok: true as const,
      data,
    });
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo cargar la conciliación bancaria." },
      { status: 500 }
    );
  }
}
