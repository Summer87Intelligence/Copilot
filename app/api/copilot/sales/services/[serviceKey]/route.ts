import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { parseSalesFilters } from "@/lib/sales/sales-api";
import { buildServiceDrillDown } from "@/lib/sales/canonical/sales-analytics";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ serviceKey: string }> };

/** Drill-down on-demand de un servicio (productGroupKey). */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;

  const { serviceKey: rawKey } = await ctx.params;
  let serviceKey = "";
  try {
    serviceKey = decodeURIComponent(rawKey ?? "").trim();
  } catch {
    serviceKey = (rawKey ?? "").trim();
  }
  if (!serviceKey) {
    return NextResponse.json(
      { ok: false as const, code: "INVALID_KEY", message: "Falta la clave del servicio." },
      { status: 400 }
    );
  }

  try {
    const dataset = await loadSalesDataset(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    const filters = parseSalesFilters(request.nextUrl.searchParams, todayYmdMontevideo());
    const data = buildServiceDrillDown(
      dataset.documents,
      serviceKey,
      filters.dateFrom,
      filters.dateTo,
      filters.comparisonDateFrom,
      filters.comparisonDateTo
    );

    if (data.summary.invoiceCount === 0 && data.invoices.length === 0) {
      return NextResponse.json(
        { ok: false as const, code: "NOT_FOUND", message: "No hay ventas de este servicio en el período." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true as const, data, meta: { period: filters } });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "SALES_LOAD_ERROR" as const,
        message: "No pudimos cargar el detalle del servicio.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
