export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { buildDebtorsReportModel } from "@/lib/reports/debtors-report/build-debtors-report-model";
import { parseDebtorsReportFiltersFromSearchParams } from "@/lib/reports/debtors-report/debtors-report-filters";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "reportes");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "debtors_report_json" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json({ ok: false, error: "Sin workspace válido." }, { status: 403 });
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const filters = parseDebtorsReportFiltersFromSearchParams(request.nextUrl.searchParams);
    const portfolio = await getClientPortfolio(supabase, tenantCompanyId);

    const model = buildDebtorsReportModel({
      portfolioRows: portfolio.rows,
      details: portfolio.details,
      filters,
      emittedAt: new Date(),
    });

    log.info("debtors_report_json_ready", { rowCount: model.rows.length });

    return NextResponse.json(
      { ok: true, model },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    log.error("debtors_report_json_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo cargar el reporte de deudores." },
      { status: 500 }
    );
  }
}
