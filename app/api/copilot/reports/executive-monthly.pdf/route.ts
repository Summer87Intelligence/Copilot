export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { ISSUER_FALLBACK } from "@/lib/account-statement/issuer-fallback";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import {
  getProtoCompanyById,
  listProtoCompanies,
  listProtoInvoices,
} from "@/lib/data/proto-operational-read-repository";
import {
  buildExecutiveMonthlyReportModel,
} from "@/lib/reports/executive-monthly-report/build-executive-monthly-report-model";
import type { ExecutiveReportCurrency } from "@/lib/reports/executive-monthly-report/build-executive-monthly-report-model";
import { renderExecutiveMonthlyReportPdf } from "@/lib/reports/executive-monthly-report/render-executive-monthly-report-pdf";
import { manualCashMovementRepositoryList } from "@/lib/treasury/repositories/manual-cash-movement-repository";
import { treasuryCashOpeningBalanceRepositoryList } from "@/lib/treasury/repositories/treasury-cash-opening-balance-repository";
import { cashMonthlyMonthRange } from "@/lib/reports/cash-monthly-report/build-cash-monthly-report-model";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

function reportFilename(year: number, month: number, currency: string): string {
  const mm = String(month).padStart(2, "0");
  return `ejecutivo-${year}-${mm}-${currency}.pdf`;
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "executive_monthly_report_pdf" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
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
      return NextResponse.json(
        { ok: false, error: "Moneda inválida. Use UYU o USD." },
        { status: 400 }
      );
    }
    const currency = currencyRaw as ExecutiveReportCurrency;

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const { from, to } = cashMonthlyMonthRange(yearRaw, monthRaw);

    log.info("executive_monthly_report_pdf_fetching", {
      year: yearRaw,
      month: monthRaw,
      currency,
    });

    const [movementsResult, openingBalancesResult, invoices, companies, portfolio, issuerRow] =
      await Promise.all([
        manualCashMovementRepositoryList(
          supabase,
          tenantCompanyId,
          { currencyCode: currency, fromDate: from, toDate: to, status: "active" },
          500
        ),
        treasuryCashOpeningBalanceRepositoryList(supabase, tenantCompanyId),
        listProtoInvoices(supabase, "active", tenantCompanyId),
        listProtoCompanies(supabase, "active", tenantCompanyId),
        getClientPortfolio(supabase, tenantCompanyId),
        getProtoCompanyById(supabase, tenantCompanyId, tenantCompanyId).catch(() => null),
      ]);

    const companyNames: Record<string, string> = {};
    for (const c of companies) {
      const id = typeof c.id === "string" ? c.id : "";
      const name = typeof c.name === "string" ? c.name : "";
      if (id && name) companyNames[id] = name;
    }

    const issuerName =
      String(
        issuerRow?.name ?? issuerRow?.company_name ?? issuerRow?.zeta_client_name ?? ""
      ).trim() || ISSUER_FALLBACK.name;

    const model = buildExecutiveMonthlyReportModel({
      movements: movementsResult.rows,
      openingBalances: openingBalancesResult.rows,
      invoices,
      companyNames,
      portfolioRows: portfolio.rows,
      year: yearRaw,
      month: monthRaw,
      currency,
      generatedAt: new Date(),
      issuerName,
    });

    const pdfBuffer = await renderExecutiveMonthlyReportPdf({ model });

    log.info("executive_monthly_report_pdf_ready", {
      riskLevel: model.riskLevel,
      alerts: model.alerts.length,
      bytes: pdfBuffer.length,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportFilename(yearRaw, monthRaw, currency)}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    log.error("executive_monthly_report_pdf_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo generar el reporte ejecutivo." },
      { status: 500 }
    );
  }
}
