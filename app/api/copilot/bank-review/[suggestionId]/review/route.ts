import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { reviewSuggestion } from "@/lib/bank/review/bank-review-actions.server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ suggestionId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { suggestionId } = await params;
  if (!UUID_RE.test(suggestionId)) {
    return NextResponse.json({ ok: false as const, error: "Identificador de sugerencia inválido." }, { status: 400 });
  }

  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements", {});
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const result = await reviewSuggestion(supabase, tenantCompanyId, suggestionId, appUser.id);

  if (!result.ok) {
    return NextResponse.json({ ok: false as const, code: result.code }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true as const, status: result.status });
}
