export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";

import { ISSUER_FALLBACK } from "@/lib/account-statement/issuer-fallback";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { enforcePdfRateLimit } from "@/lib/security/pdf-rate-limit";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import {
  getProtoCompanyById,
  listProtoCompanies,
  listProtoReceipts,
} from "@/lib/data/proto-operational-read-repository";
import { buildCollectionsReportModel } from "@/lib/reports/collections-report/build-collections-report-model";
import type { CollectionsReportCurrency } from "@/lib/reports/collections-report/build-collections-report-model";
import { renderCollectionsReportPdf } from "@/lib/reports/collections-report/render-collections-report-pdf";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

function reportFilename(year: number, month: number, currency: string): string {
  const mm = String(month).padStart(2, "0");
  return `cobranza-${year}-${mm}-${currency}.pdf`;
}

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleAccess(request, "reportes");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "collections_report_pdf" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const rateLimited = enforcePdfRateLimit(request, "reports/collections", auth.ctx.appUser.id);
    if (rateLimited) return rateLimited;

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
    const currency = currencyRaw as CollectionsReportCurrency;

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    log.info("collections_report_pdf_fetching", { year: yearRaw, month: monthRaw, currency });

    const [receipts, companies, issuerRow] = await Promise.all([
      listProtoReceipts(supabase, "active", tenantCompanyId),
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
      String(
        issuerRow?.name ?? issuerRow?.company_name ?? issuerRow?.zeta_client_name ?? ""
      ).trim() || ISSUER_FALLBACK.name;

    const model = buildCollectionsReportModel({
      receipts,
      companyNames,
      year: yearRaw,
      month: monthRaw,
      currency,
      generatedAt: new Date(),
      issuerName,
    });

    const pdfBuffer = await renderCollectionsReportPdf({ model });

    log.info("collections_report_pdf_ready", {
      rowCount: model.totals.count,
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
    log.error("collections_report_pdf_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo generar el reporte de cobranza." },
      { status: 500 }
    );
  }
}
