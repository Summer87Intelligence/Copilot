import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { revokeClientIdentificationForMovement } from "@/lib/bank/canonical/confirm-client-identification.server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  movementId: z.string().uuid(),
});

/**
 * POST /api/copilot/bank-reconciliation/client-identifications/revoke
 *
 * "Revocar asociación" — el movimiento vuelve a Sin cliente. Nunca borra la
 * fila (append-only, igual que reasignar); nunca toca conciliación financiera.
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

  try {
    const result = await revokeClientIdentificationForMovement(auth.ctx.supabase, {
      workspaceId: auth.ctx.tenantCompanyId,
      actorUserId: auth.ctx.appUser.id,
      movementId: parsed.data.movementId,
    });
    return NextResponse.json({ ok: true as const, data: { revokedId: result.revokedId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "REVOKE_FAILED";
    const status = message === "NO_ACTIVE_IDENTIFICATION_TO_REVOKE" ? 409 : 500;
    return NextResponse.json({ ok: false as const, error: message }, { status });
  }
}
