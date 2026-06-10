export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import {
  buildAccountStatementApiModel,
} from "@/lib/account-statement/build-account-statement-api-model";

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotModuleAccess(request, "clientes");
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "account_statement_json" });
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

    const { companyId } = await params;
    if (!companyId?.trim()) {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "Falta companyId." },
        { status: 400 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from")?.trim() || undefined;
    const to = sp.get("to")?.trim() || undefined;
    const currencyParam = sp.get("currency")?.trim().toUpperCase();
    const currencies: Array<"UYU" | "USD"> =
      currencyParam === "UYU" ? ["UYU"] :
      currencyParam === "USD" ? ["USD"] :
      ["UYU", "USD"];

    const model = await buildAccountStatementApiModel(supabase, companyId, tenantCompanyId, {
      from,
      to,
      currencies,
    });

    log.info("account_statement_json_done", {
      companyId,
      from,
      to,
      currencies,
      openingUyu: model.openingBalanceUyu,
      movementCounts: model.blocks.map((b) => b.movements.length),
    });

    return NextResponse.json(
      {
        ok: true,
        companyName: model.companyName,
        from,
        to,
        currencies,
        blocks: model.blocks,
        unknownCurrencyCount: model.statement.unknownCurrencyCount,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[account-statement-json] INTERNAL_ERROR:", errMsg);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "No se pudo generar el estado de cuenta." },
      { status: 500 }
    );
  }
}
