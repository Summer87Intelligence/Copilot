import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { loadSalesDataset } from "@/lib/sales/sales-data-source";
import { parseSalesFilters } from "@/lib/sales/sales-api";
import { buildSalespersonDrillDown } from "@/lib/sales/canonical/sales-analytics";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ salespersonId: string }> };

/** Drill-down on-demand de un comercial. `unassigned` = Sin asignar. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;

  const { salespersonId: rawId } = await ctx.params;
  const raw = (rawId ?? "").trim();
  if (!raw) {
    return NextResponse.json(
      { ok: false as const, code: "INVALID_ID", message: "Falta el identificador del comercial." },
      { status: 400 }
    );
  }
  const salespersonId = raw === "unassigned" ? null : raw;

  try {
    const dataset = await loadSalesDataset(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    const filters = parseSalesFilters(request.nextUrl.searchParams, todayYmdMontevideo());
    const data = buildSalespersonDrillDown(
      dataset.documents,
      salespersonId,
      filters.dateFrom,
      filters.dateTo
    );

    return NextResponse.json({ ok: true as const, data, meta: { period: filters } });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "SALES_LOAD_ERROR" as const,
        message: "No pudimos cargar el detalle del comercial.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
