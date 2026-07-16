import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { parseSalesFilters, buildSalesOverview } from "@/lib/sales/sales-api";
import { buildCustomerDrillDown } from "@/lib/sales/canonical/sales-analytics";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ customerId: string }> };

/** Drill-down on-demand de un cliente. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;

  const { customerId: rawId } = await ctx.params;
  const customerId = (rawId ?? "").trim();
  if (!customerId) {
    return NextResponse.json(
      { ok: false as const, code: "INVALID_ID", message: "Falta el identificador del cliente." },
      { status: 400 }
    );
  }

  try {
    const dataset = await loadSalesDataset(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    const filters = parseSalesFilters(request.nextUrl.searchParams, todayYmdMontevideo());
    const overview = buildSalesOverview(dataset.documents, dataset.catalog, filters);
    const periodTotalUsd = overview.snapshot.salesEmitted.USD;
    const data = buildCustomerDrillDown(
      dataset.documents,
      customerId,
      filters.dateFrom,
      filters.dateTo,
      periodTotalUsd
    );

    if (data.summary.invoiceCount === 0 && data.invoices.length === 0) {
      return NextResponse.json(
        { ok: false as const, code: "NOT_FOUND", message: "No hay ventas de este cliente en el período." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true as const, data, meta: { period: filters } });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "SALES_LOAD_ERROR" as const,
        message: "No pudimos cargar el análisis del cliente.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
