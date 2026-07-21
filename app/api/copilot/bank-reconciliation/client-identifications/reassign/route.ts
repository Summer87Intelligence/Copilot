import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { reassignClientIdentification } from "@/lib/bank/canonical/confirm-client-identification.server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  movementId: z.string().uuid(),
  newClientCompanyId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

/**
 * POST /api/copilot/bank-reconciliation/client-identifications/reassign
 *
 * "Elegir otro cliente" — acción explícita y auditada (motivo obligatorio).
 * Revoca la identificación activa (queda como histórico) y crea una nueva
 * para el cliente elegido. NUNCA toca conciliación financiera.
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
    const result = await reassignClientIdentification(auth.ctx.supabase, {
      workspaceId: auth.ctx.tenantCompanyId,
      actorUserId: auth.ctx.appUser.id,
      movementId: parsed.data.movementId,
      newClientCompanyId: parsed.data.newClientCompanyId,
      reason: parsed.data.reason,
    });
    return NextResponse.json({
      ok: true as const,
      data: { revokedId: result.revokedId, identificationId: result.created.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "REASSIGN_FAILED";
    const status = message === "NO_ACTIVE_IDENTIFICATION_TO_REASSIGN" ? 409 : 500;
    return NextResponse.json({ ok: false as const, error: message }, { status });
  }
}
