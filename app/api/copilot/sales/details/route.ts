import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { parseSalesFilters, buildSalesDetails } from "@/lib/sales/sales-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;

  try {
    const dataset = await loadSalesDataset(supabase, tenantCompanyId);
    const filters = parseSalesFilters(request.nextUrl.searchParams, todayYmdMontevideo());
    const details = buildSalesDetails(dataset.documents, filters);

    return NextResponse.json({
      ok: true as const,
      data: details.rows,
      meta: {
        total: details.total,
        page: details.page,
        pageSize: details.pageSize,
        catalogMigrationPending: dataset.meta.catalogMigrationPending,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "SALES_LOAD_ERROR" as const,
        message: "No pudimos cargar el detalle de ventas.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
