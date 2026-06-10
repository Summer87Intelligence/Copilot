export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { buildTopClientsReportModel } from "@/lib/reports/top-clients-report/build-top-clients-report-model";
import type {
  TopClientsReportCurrency,
  TopClientsReportSortBy,
} from "@/lib/reports/top-clients-report/build-top-clients-report-model";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

const VALID_SORT_BY = new Set<TopClientsReportSortBy>(["net_sales", "debt", "overdue"]);

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "reportes");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "top_clients_report_json" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json({ ok: false, error: "Sin workspace válido." }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const yearRaw = parseInt(sp.get("year") ?? "", 10);
    const monthRaw = parseInt(sp.get("month") ?? "", 10);
    const currencyRaw = sp.get("currency");
    const sortRaw = sp.get("sort") ?? "net_sales";

    if (!Number.isInteger(yearRaw) || yearRaw < 2020 || yearRaw > 2100) {
      return NextResponse.json({ ok: false, error: "Año inválido." }, { status: 400 });
    }
    if (!Number.isInteger(monthRaw) || monthRaw < 1 || monthRaw > 12) {
      return NextResponse.json({ ok: false, error: "Mes inválido (1-12)." }, { status: 400 });
    }
    if (currencyRaw !== "UYU" && currencyRaw !== "USD") {
      return NextResponse.json({ ok: false, error: "Moneda inválida. Use UYU o USD." }, { status: 400 });
    }
    if (!VALID_SORT_BY.has(sortRaw as TopClientsReportSortBy)) {
      return NextResponse.json(
        { ok: false, error: "Parámetro sort inválido. Use net_sales, debt o overdue." },
        { status: 400 }
      );
    }

    const currency = currencyRaw as TopClientsReportCurrency;
    const sortBy = sortRaw as TopClientsReportSortBy;

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const portfolio = await getClientPortfolio(supabase, tenantCompanyId);

    const model = buildTopClientsReportModel({
      portfolioRows: portfolio.rows,
      year: yearRaw,
      month: monthRaw,
      currency,
      sortBy,
      generatedAt: new Date(),
    });

    log.info("top_clients_report_json_ready", { rowCount: model.rows.length });

    return NextResponse.json(
      { ok: true, model },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    log.error("top_clients_report_json_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo cargar el reporte de clientes principales." },
      { status: 500 }
    );
  }
}
