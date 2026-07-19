import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { rejectSuggestion } from "@/lib/bank/review/bank-review-actions.server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rejectBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

type RouteParams = { params: Promise<{ suggestionId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { suggestionId } = await params;
  if (!UUID_RE.test(suggestionId)) {
    return NextResponse.json({ ok: false as const, error: "Identificador de sugerencia inválido." }, { status: 400 });
  }

  const parsed = await parseAndValidateJsonBody(request, rejectBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements", parsed.data);
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const result = await rejectSuggestion(supabase, tenantCompanyId, suggestionId, appUser.id, parsed.data.reason);

  if (!result.ok) {
    return NextResponse.json({ ok: false as const, code: result.code }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true as const, status: result.status });
}
