import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { confirmBatchClientIdentification } from "@/lib/bank/canonical/confirm-client-identification.server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  clientCompanyId: z.string().uuid(),
  movementIds: z.array(z.string().uuid()).min(1).max(200),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
  status: z.enum(["identified", "shared_account", "third_party"]).optional(),
});

/**
 * POST /api/copilot/bank-reconciliation/client-identifications
 *
 * Confirma en lote "estos movimientos son de <cliente>". Escribe ÚNICAMENTE
 * en bank_movement_client_identifications (migración local, no aplicada
 * todavía en producción). NUNCA crea un link financiero, allocation ni evento
 * de conciliación, y NUNCA marca una factura como pagada. Idempotente para
 * movimientos ya identificados con el mismo cliente; los que ya tienen una
 * identificación activa para OTRO cliente se reportan como conflicto y no se
 * sobrescriben (requieren una acción explícita de reasignación aparte).
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
    const result = await confirmBatchClientIdentification(auth.ctx.supabase, {
      workspaceId: auth.ctx.tenantCompanyId,
      actorUserId: auth.ctx.appUser.id,
      clientCompanyId: parsed.data.clientCompanyId,
      movementIds: parsed.data.movementIds,
      reason: parsed.data.reason ?? null,
      status: parsed.data.status,
    });
    return NextResponse.json({
      ok: true as const,
      data: {
        createdCount: result.created.length,
        alreadyIdentifiedSameClient: result.alreadyIdentifiedSameClient,
        conflicts: result.conflicts,
        blockedNonInflow: result.blockedNonInflow,
        alreadyReconciled: result.alreadyReconciled,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: err instanceof Error ? err.message : "CLIENT_IDENTIFICATION_FAILED" },
      { status: 500 }
    );
  }
}
