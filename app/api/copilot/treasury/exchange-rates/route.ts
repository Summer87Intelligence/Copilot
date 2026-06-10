import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import {
  treasuryExchangeRateCreate,
  treasuryExchangeRateGet,
} from "@/lib/treasury/services/treasury-exchange-rate-service";
import { nextResponseFromTreasuryCrud } from "@/lib/treasury/treasury-http";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const result = await treasuryExchangeRateGet(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    return nextResponseFromTreasuryCrud(result);
  } catch (err) {
    console.error("[exchange-rates/GET]", err);
    return NextResponse.json({ ok: false, code: "DATABASE", message: MSG_DB_USER }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleWriteAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, code: "VALIDATION", message: "Body inválido." }, { status: 400 });
    }

    const uyuPerUsd = Number(body.uyu_per_usd ?? body.uyuPerUsd);
    if (!Number.isFinite(uyuPerUsd) || uyuPerUsd <= 0) {
      return NextResponse.json({ ok: false, code: "VALIDATION", message: "uyu_per_usd debe ser un número positivo." }, { status: 400 });
    }
    if (uyuPerUsd >= 1000) {
      return NextResponse.json({ ok: false, code: "VALIDATION", message: "uyu_per_usd debe ser menor a 1000 (valor en pesos por dólar)." }, { status: 400 });
    }

    const result = await treasuryExchangeRateCreate(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      {
        uyuPerUsd,
        effectiveDate: typeof body.effective_date === "string" ? body.effective_date : undefined,
        source: typeof body.source === "string" ? (body.source as "manual") : "manual",
        notes: typeof body.notes === "string" ? body.notes : null,
      },
      auth.ctx.appUser.id
    );
    if (!result.ok) return nextResponseFromTreasuryCrud(result);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[exchange-rates/POST]", err);
    return NextResponse.json({ ok: false, code: "DATABASE", message: MSG_DB_USER }, { status: 500 });
  }
}
