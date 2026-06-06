export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";

import { ISSUER_FALLBACK } from "@/lib/account-statement/issuer-fallback";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { enforcePdfRateLimit } from "@/lib/security/pdf-rate-limit";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { getProtoCompanyById } from "@/lib/data/proto-operational-read-repository";
import { buildDebtorsReportModel } from "@/lib/reports/debtors-report/build-debtors-report-model";
import { parseDebtorsReportFiltersFromSearchParams } from "@/lib/reports/debtors-report/debtors-report-filters";
import { renderDebtorsReportPdf } from "@/lib/reports/debtors-report/render-debtors-report-pdf";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

function reportFilename(): string {
  const d = new Date().toISOString().slice(0, 10);
  return `reporte-deudores-${d}.pdf`;
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "debtors_report_pdf" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const rateLimited = enforcePdfRateLimit(request, "reports/debtors", auth.ctx.appUser.id);
    if (rateLimited) return rateLimited;

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const filters = parseDebtorsReportFiltersFromSearchParams(request.nextUrl.searchParams);

    log.info("debtors_report_pdf_fetching", { filters });

    const [portfolio, issuerRow] = await Promise.all([
      getClientPortfolio(supabase, tenantCompanyId),
      getProtoCompanyById(supabase, tenantCompanyId, tenantCompanyId).catch(() => null),
    ]);

    const issuerName =
      String(issuerRow?.name ?? issuerRow?.company_name ?? issuerRow?.zeta_client_name ?? "").trim() ||
      ISSUER_FALLBACK.name;

    const model = buildDebtorsReportModel({
      portfolioRows: portfolio.rows,
      details: portfolio.details,
      filters,
      emittedAt: new Date(),
    });
    model.issuerName = issuerName;

    const pdfBuffer = await renderDebtorsReportPdf({ model, issuerName });

    log.info("debtors_report_pdf_ready", {
      rowCount: model.rows.length,
      bytes: pdfBuffer.length,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportFilename()}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    log.error("debtors_report_pdf_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo generar el reporte de deudores." },
      { status: 500 }
    );
  }
}
