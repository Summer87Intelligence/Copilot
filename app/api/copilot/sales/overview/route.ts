import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { parseSalesFilters, buildSalesOverview } from "@/lib/sales/sales-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;

  try {
    const dataset = await loadSalesDataset(supabase, tenantCompanyId);
    const filters = parseSalesFilters(request.nextUrl.searchParams, todayYmdMontevideo());
    const overview = buildSalesOverview(dataset.documents, dataset.catalog, filters, {
      firstSaleByCustomerId: dataset.firstSaleByCustomerId,
      assignedCustomerCountBySalesperson: dataset.assignedCustomerCountBySalesperson,
    });

    return NextResponse.json({
      ok: true as const,
      data: overview,
      meta: {
        ...dataset.meta,
        salespersonAvailable: !dataset.meta.salespersonsMigrationPending,
        clientAssignmentAvailable: !dataset.meta.clientAssignmentMigrationPending,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "SALES_LOAD_ERROR" as const,
        message: "No pudimos cargar los datos de ventas.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
