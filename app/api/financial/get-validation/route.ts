import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { getFinancialValidation } from "@/lib/financial-validation";

/**
 * GET /api/financial/get-validation?period=...
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "").trim();

    if (!period) {
      return NextResponse.json(
        { ok: false as const, code: "BAD_REQUEST", error: "Falta query `period`." },
        { status: 400 }
      );
    }

    const row = await getFinancialValidation(
      auth.ctx.tenantCompanyId,
      period,
      auth.ctx.supabase
    );

    return NextResponse.json({
      ok: true as const,
      period,
      external_validated: row?.validated === true,
      validated_at: row?.validated_at ?? null,
      source: row?.source ?? null,
      notes: row?.notes ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", error: message },
      { status: 500 }
    );
  }
}
