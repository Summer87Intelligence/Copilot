import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { buildSalesYearlyView, parseSalesFilters, buildSalesOverview } from "@/lib/sales/sales-api";
import { buildServicePeriodComparison } from "@/lib/sales/canonical/sales-analytics";

export const dynamic = "force-dynamic";

/** Comparativo anual mes a mes + comparación por servicio del período filtrado. */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;

  try {
    const today = todayYmdMontevideo();
    const params = request.nextUrl.searchParams;
    const yearRaw = parseInt(params.get("year") ?? today.slice(0, 4), 10);
    const year = Number.isFinite(yearRaw) && yearRaw >= 2026 && yearRaw <= 2100 ? yearRaw : parseInt(today.slice(0, 4), 10);

    const dataset = await loadSalesDataset(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    const filters = parseSalesFilters(params, today);
    const yearly = buildSalesYearlyView(dataset.documents, year, today);
    const overview = buildSalesOverview(dataset.documents, dataset.catalog, filters);
    const serviceComparison = buildServicePeriodComparison(
      dataset.documents,
      filters.dateFrom,
      filters.dateTo,
      filters.comparisonDateFrom,
      filters.comparisonDateTo
    );

    return NextResponse.json({
      ok: true as const,
      data: {
        yearly,
        periodComparison: overview.comparison,
        serviceComparison,
        period: overview.period,
        comparisonWindow: overview.comparisonWindow,
      },
      meta: dataset.meta,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "SALES_LOAD_ERROR" as const,
        message: "No pudimos cargar el comparativo anual.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
