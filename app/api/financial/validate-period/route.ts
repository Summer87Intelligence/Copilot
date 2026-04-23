import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { validateFinancialPeriod } from "@/lib/financial-validation";

type ValidatePeriodBody = {
  period?: string;
  notes?: string | null;
  source?: string;
};

/**
 * POST /api/financial/validate-period
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json().catch(() => null);
    const body = (raw && typeof raw === "object" ? raw : {}) as ValidatePeriodBody;

    const auth = await requireCopilotTenantContext(request, body);
    if (!auth.ok) {
      return auth.response;
    }

    const period = typeof body.period === "string" ? body.period.trim() : "";
    if (!period) {
      return NextResponse.json(
        { ok: false as const, code: "BAD_REQUEST", error: "Falta `period` en el cuerpo JSON." },
        { status: 400 }
      );
    }

    let notes: string | null = null;
    if (typeof body.notes === "string") {
      const t = body.notes.trim();
      notes = t === "" ? null : t;
    }
    const source = typeof body.source === "string" ? body.source.trim() : undefined;

    const validatedBy =
      auth.ctx.appUser.email?.trim() ||
      auth.ctx.authUser.email?.trim() ||
      "admin";

    const row = await validateFinancialPeriod(auth.ctx.supabase, {
      companyId: auth.ctx.tenantCompanyId,
      periodMonth: period,
      user: validatedBy,
      source: source && source.length > 0 ? source : undefined,
      notes,
    });

    return NextResponse.json({
      ok: true as const,
      period: row.period_month,
      external_validated: row.validated === true,
      validated_at: row.validated_at,
      source: row.source,
      notes: row.notes,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", error: message },
      { status: 500 }
    );
  }
}
