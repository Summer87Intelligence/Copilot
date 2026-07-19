import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { fetchBankReviewRows } from "@/lib/bank/review/bank-review-service.server";
import { SHADOW_SUGGESTION_SCOPES, type SuggestionScope } from "@/lib/bank/intelligence/server/types";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";
const COLUMN_MISSING_CODE = "42703";

function isScope(value: string | null): value is SuggestionScope {
  return value != null && (SHADOW_SUGGESTION_SCOPES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const scopeParam = request.nextUrl.searchParams.get("scope");
  if (!isScope(scopeParam)) {
    return NextResponse.json(
      { ok: false as const, message: "scope inválido (operational | historical_review | matched_audit)." },
      { status: 400 }
    );
  }

  const { supabase, tenantCompanyId } = auth.ctx;

  try {
    const result = await fetchBankReviewRows(supabase, tenantCompanyId, scopeParam);
    return NextResponse.json({
      ok: true as const,
      scope: result.scope,
      data: result.rows,
      meta: { total: result.total, capped: result.capped, migration_pending: false },
    });
  } catch (error) {
    const code = (error as { message?: string })?.message ?? "";
    if (code.includes(TABLE_MISSING_CODE) || code.includes(COLUMN_MISSING_CODE)) {
      return NextResponse.json({
        ok: true as const,
        scope: scopeParam,
        data: [],
        meta: { total: 0, capped: false, migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudieron cargar las sugerencias de revisión." },
      { status: 500 }
    );
  }
}
