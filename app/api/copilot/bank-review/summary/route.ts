import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { fetchBankReviewSummary } from "@/lib/bank/review/bank-review-service.server";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";
const COLUMN_MISSING_CODE = "42703";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;

  try {
    const summary = await fetchBankReviewSummary(supabase, tenantCompanyId);
    return NextResponse.json({ ok: true as const, data: summary, meta: { migration_pending: false } });
  } catch (error) {
    const code = (error as { message?: string })?.message ?? "";
    if (code.includes(TABLE_MISSING_CODE) || code.includes(COLUMN_MISSING_CODE)) {
      return NextResponse.json({
        ok: true as const,
        data: { operational: 0, historical_review: 0, matched_audit: 0, pending: 0 },
        meta: { migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudo cargar el resumen de revisión." },
      { status: 500 }
    );
  }
}
