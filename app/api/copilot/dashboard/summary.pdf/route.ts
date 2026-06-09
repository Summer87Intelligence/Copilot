export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";

import { ISSUER_FALLBACK } from "@/lib/account-statement/issuer-fallback";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { enforcePdfRateLimit } from "@/lib/security/pdf-rate-limit";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { getProtoCompanyById } from "@/lib/data/proto-operational-read-repository";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { fetchDashboardSummaryData } from "@/lib/reports/dashboard-summary-report/fetch-dashboard-summary-data";
import {
  buildDashboardSummaryPdfModel,
  type DashboardSummaryPdfCurrency,
} from "@/lib/reports/dashboard-summary-report/build-dashboard-summary-pdf-model";
import { renderDashboardSummaryPdf } from "@/lib/reports/dashboard-summary-report/render-dashboard-summary-pdf";
import { treasuryExchangeRateGet } from "@/lib/treasury/services/treasury-exchange-rate-service";

const VALID_CURRENCIES: DashboardSummaryPdfCurrency[] = ["all", "UYU", "USD", "USD_consolidated"];

function reportFilename(from: string, to: string, currency: string): string {
  return `dashboard-resumen-${from}-${to}-${currency}.pdf`;
}

function isValidDate(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !isNaN(Date.parse(ymd));
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "dashboard_summary_pdf" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const rateLimited = enforcePdfRateLimit(request, "dashboard/summary", auth.ctx.appUser.id);
    if (rateLimited) return rateLimited;

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from") ?? "";
    const to = sp.get("to") ?? "";
    const currencyRaw = sp.get("currency") ?? "all";

    if (!isValidDate(from)) {
      return NextResponse.json({ ok: false, error: "Parámetro 'from' inválido (YYYY-MM-DD)." }, { status: 400 });
    }
    if (!isValidDate(to)) {
      return NextResponse.json({ ok: false, error: "Parámetro 'to' inválido (YYYY-MM-DD)." }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ ok: false, error: "El parámetro 'from' debe ser anterior o igual a 'to'." }, { status: 400 });
    }
    if (!VALID_CURRENCIES.includes(currencyRaw as DashboardSummaryPdfCurrency)) {
      return NextResponse.json(
        { ok: false, error: "Moneda inválida. Use all, UYU, USD o USD_consolidated." },
        { status: 400 }
      );
    }
    const currency = currencyRaw as DashboardSummaryPdfCurrency;

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    // If consolidated mode, require a configured TC
    let exchangeRateUyuPerUsd: number | undefined;
    if (currency === "USD_consolidated") {
      const tcResult = await treasuryExchangeRateGet(supabase, tenantCompanyId);
      const tc = tcResult.ok ? tcResult.data.rate?.uyuPerUsd : undefined;
      if (!tc) {
        return NextResponse.json(
          { ok: false, error: "No hay tipo de cambio configurado. Configurá el TC en Tesorería antes de generar el PDF consolidado." },
          { status: 422 }
        );
      }
      exchangeRateUyuPerUsd = tc;
    }

    log.info("dashboard_summary_pdf_fetching", { from, to, currency, exchangeRateUyuPerUsd });

    const [data, issuerRow] = await Promise.all([
      fetchDashboardSummaryData(supabase, tenantCompanyId, from, to),
      getProtoCompanyById(supabase, tenantCompanyId, tenantCompanyId).catch(() => null),
    ]);

    const issuerName =
      String(
        issuerRow?.name ?? issuerRow?.company_name ?? issuerRow?.zeta_client_name ?? ""
      ).trim() || ISSUER_FALLBACK.name;

    const model = buildDashboardSummaryPdfModel(data, {
      from,
      to,
      currency,
      issuerName,
      generatedAt: new Date(),
      exchangeRateUyuPerUsd,
    });

    const pdfBuffer = await renderDashboardSummaryPdf(model);

    log.info("dashboard_summary_pdf_ready", {
      dashboardState: model.dashboardState,
      activeDebtRows: model.activeDebtRows.length,
      recentMovements: model.recentMovements.length,
      bytes: pdfBuffer.length,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportFilename(from, to, currency)}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    log.error("dashboard_summary_pdf_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo generar el resumen de dashboard." },
      { status: 500 }
    );
  }
}
