import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { createOrReuseManualDraftSuggestion } from "@/lib/bank/canonical/create-manual-draft-suggestion.server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  movementId: z.string().uuid(),
});

/**
 * POST /api/copilot/bank-reconciliation/manual-draft
 *
 * Crea o reutiliza una suggestion operational manual_draft para un movimiento
 * sin suggestion canónica. No confirma, no crea link ni allocation.
 */
export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "bank_movements",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const result = await createOrReuseManualDraftSuggestion(auth.ctx.supabase, {
    workspaceId: auth.ctx.tenantCompanyId,
    actorUserId: auth.ctx.appUser.id,
    movementId: parsed.data.movementId,
  });

  if (!result.ok) {
    const status =
      result.code === "MOVEMENT_NOT_FOUND"
        ? 404
        : result.code === "MOVEMENT_ALREADY_RECONCILED" || result.code === "MOVEMENT_NOT_RECONCILABLE"
          ? 409
          : 400;
    return NextResponse.json(
      { ok: false as const, error: result.code, message: result.message },
      { status }
    );
  }

  return NextResponse.json({
    ok: true as const,
    data: {
      suggestionId: result.suggestionId,
      movementId: result.movementId,
      reused: result.reused,
    },
  });
}
