import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { computeCopilotRealInsights } from "@/lib/copilot-real-insights";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";

function realInsightsErrorPayload(e: unknown): { message: string; code: string } {
  if (e instanceof Error) {
    const withCode = e as Error & { code?: unknown };
    if (typeof withCode.code === "string" && withCode.code.trim()) {
      return { message: e.message, code: withCode.code.trim() };
    }
    return { message: e.message, code: "INSIGHTS_COMPUTE_ERROR" };
  }
  return { message: "Error desconocido", code: "UNKNOWN" };
}

/**
 * GET /api/copilot/real-insights
 * Insights calculados en vivo desde proto_companies, proto_invoices, proto_tax_obligations y snapshot financiero.
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const computedAt = () => new Date().toISOString();

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      log.warn("copilot_tenant_empty", { phase: "after_auth" });
      return NextResponse.json(
        {
          ok: false as const,
          code: "FORBIDDEN_TENANT",
          error: "Espacio de trabajo sin identificador válido.",
          insights: [],
          computedAt: computedAt(),
        },
        { status: 403 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log("=== COPILOT DEBUG ===");
      console.log("user:", auth.ctx.authUser?.email);
      console.log(
        "company_id:",
        auth.ctx.appUser?.company_id ?? auth.ctx.tenantCompanyId
      );
      console.log("full auth ctx:", auth.ctx);
    }

    // Cliente SSR con cookies (`createServerClient` en `createRouteSupabaseClient`).
    // Si hay JWT de Supabase Auth, las lecturas respetan RLS; si no (sesión solo PIN),
    // `requireCopilotTenantContext` ya expone un cliente operativo adecuado en `auth.ctx`.
    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabaseForInsights =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    let insights;
    try {
      insights = await computeCopilotRealInsights(
        supabaseForInsights,
        tenantCompanyId
      );
    } catch (e) {
      const { message, code } = realInsightsErrorPayload(e);
      log.error("copilot_real_insights_compute_failed", e, {
        route: "GET /api/copilot/real-insights",
        code,
        message,
      });
      return NextResponse.json(
        {
          ok: false as const,
          code,
          error: message,
          insights: [],
          computedAt: computedAt(),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true as const,
      insights,
      computedAt: computedAt(),
    });
  } catch (e) {
    const { message, code } = realInsightsErrorPayload(e);
    log.error("copilot_real_insights_failed", e, {
      route: "GET /api/copilot/real-insights",
      code,
      message,
    });
    return NextResponse.json(
      {
        ok: false as const,
        code: code === "UNKNOWN" ? "UNEXPECTED" : code,
        error: message,
        insights: [],
        computedAt: computedAt(),
      },
      { status: 500 }
    );
  }
}
