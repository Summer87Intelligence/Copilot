export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { ISSUER_FALLBACK } from "@/lib/account-statement/issuer-fallback";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { getProtoCompanyById } from "@/lib/data/proto-operational-read-repository";
import {
  buildCashMonthlyReportModel,
  cashMonthlyMonthRange,
} from "@/lib/reports/cash-monthly-report/build-cash-monthly-report-model";
import type { CashReportCurrency } from "@/lib/reports/cash-monthly-report/build-cash-monthly-report-model";
import { manualCashMovementRepositoryList } from "@/lib/treasury/repositories/manual-cash-movement-repository";
import { treasuryCashOpeningBalanceRepositoryList } from "@/lib/treasury/repositories/treasury-cash-opening-balance-repository";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  try {
    const auth = await requireCopilotModuleAccess(request, "reportes");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "cash_monthly_report_json" });
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
    const currency = currencyRaw as CashReportCurrency;

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const { from, to } = cashMonthlyMonthRange(yearRaw, monthRaw);

    const [movementsResult, openingBalancesResult, issuerRow] = await Promise.all([
      manualCashMovementRepositoryList(
        supabase,
        tenantCompanyId,
        { currencyCode: currency, fromDate: from, toDate: to, status: "active" },
        500
      ),
      treasuryCashOpeningBalanceRepositoryList(supabase, tenantCompanyId),
      getProtoCompanyById(supabase, tenantCompanyId, tenantCompanyId).catch(() => null),
    ]);

    const issuerName =
      String(issuerRow?.name ?? issuerRow?.company_name ?? issuerRow?.zeta_client_name ?? "").trim() ||
      ISSUER_FALLBACK.name;

    const model = buildCashMonthlyReportModel({
      movements: movementsResult.rows,
      openingBalances: openingBalancesResult.rows,
      year: yearRaw,
      month: monthRaw,
      currency,
      generatedAt: new Date(),
      issuerName,
    });

    log.info("cash_monthly_report_json_ready", { rowCount: model.totals.count });

    return NextResponse.json(
      { ok: true, model },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    log.error("cash_monthly_report_json_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "No se pudo cargar el reporte de caja." },
      { status: 500 }
    );
  }
}
