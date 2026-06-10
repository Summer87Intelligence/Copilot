export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { ISSUER_FALLBACK } from "@/lib/account-statement/issuer-fallback";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import {
  getProtoCompanyById,
  listProtoCompanies,
  listProtoInvoices,
} from "@/lib/data/proto-operational-read-repository";
import { buildNetSalesReportModel } from "@/lib/reports/net-sales-report/build-net-sales-report-model";
import type { NetSalesReportCurrency } from "@/lib/reports/net-sales-report/build-net-sales-report-model";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "reportes");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "net_sales_report_json" });
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

    if (!Number.isInteger(yearRaw) || yearRaw < 2020 || yearRaw > 2100) {
      return NextResponse.json({ ok: false, error: "Año inválido." }, { status: 400 });
    }
    if (!Number.isInteger(monthRaw) || monthRaw < 1 || monthRaw > 12) {
      return NextResponse.json({ ok: false, error: "Mes inválido (1-12)." }, { status: 400 });
    }
    if (currencyRaw !== "UYU" && currencyRaw !== "USD") {
      return NextResponse.json({ ok: false, error: "Moneda inválida. Use UYU o USD." }, { status: 400 });
    }
    const currency = currencyRaw as NetSalesReportCurrency;

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const [invoices, companies, issuerRow] = await Promise.all([
      listProtoInvoices(supabase, "active", tenantCompanyId),
      listProtoCompanies(supabase, "active", tenantCompanyId),
      getProtoCompanyById(supabase, tenantCompanyId, tenantCompanyId).catch(() => null),
    ]);

    const companyNames: Record<string, string> = {};
    for (const c of companies) {
      const id = typeof c.id === "string" ? c.id : "";
      const name = typeof c.name === "string" ? c.name : "";
      if (id && name) companyNames[id] = name;
    }

    const issuerName =
      String(issuerRow?.name ?? issuerRow?.company_name ?? issuerRow?.zeta_client_name ?? "").trim() ||
      ISSUER_FALLBACK.name;

    const model = buildNetSalesReportModel({
      invoices,
      companyNames,
      year: yearRaw,
      month: monthRaw,
      currency,
      generatedAt: new Date(),
      issuerName,
    });

    log.info("net_sales_report_json_ready", { rowCount: model.rows.length });

    return NextResponse.json(
      { ok: true, model },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    log.error("net_sales_report_json_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo cargar el reporte de ventas." },
      { status: 500 }
    );
  }
}
