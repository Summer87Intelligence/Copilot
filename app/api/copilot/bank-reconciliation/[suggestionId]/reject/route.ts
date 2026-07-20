import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { rejectCanonicalSuggestionBodySchema } from "@/lib/bank/canonical/canonical-confirm-reject-api";
import { rejectCanonicalSuggestion } from "@/lib/bank/canonical/reject-canonical-suggestion.server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_STATUS: Record<string, number> = {
  SUGGESTION_NOT_FOUND: 404,
  MOVEMENT_MISMATCH: 409,
  SCOPE_NOT_ALLOWED: 409,
  SUGGESTION_TERMINAL: 409,
  CONCURRENT_UPDATE: 409,
  REASON_INVALID: 422,
  INVALID_ACTOR: 403,
  NO_WORKSPACE: 400,
};

/**
 * Rechaza una sugerencia operacional del motor canónico (D): "esta propuesta
 * está mal", no "ignorar el movimiento". Delega en `reject_bank_suggestion_v1`
 * vía `rejectCanonicalSuggestion` — nunca toca `bank_movements`, así que el
 * movimiento sigue disponible para una futura sugerencia del motor.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> }
) {
  const { suggestionId } = await params;
  if (!UUID_RE.test(suggestionId)) {
    return NextResponse.json(
      { ok: false as const, error: "Identificador de sugerencia inválido." },
      { status: 400 }
    );
  }

  const parsed = await parseAndValidateJsonBody(request, rejectCanonicalSuggestionBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements", parsed.data as Record<string, unknown>);
  if (!auth.ok) return auth.response;

  const result = await rejectCanonicalSuggestion(auth.ctx.supabase, {
    workspaceId: auth.ctx.tenantCompanyId,
    actorUserId: auth.ctx.appUser.id,
    suggestionId,
    expectedMovementId: parsed.data.expectedMovementId,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false as const, code: result.code, error: result.message },
      { status: ERROR_STATUS[result.code] ?? 500 }
    );
  }

  return NextResponse.json({ ok: true as const, data: result.data });
}
