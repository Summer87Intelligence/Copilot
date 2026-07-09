import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { bankMovementReconcileBodySchema } from "@/lib/bank-movements/bank-movement-reconciliation-api";
import { reconcileBankMovementWithObligation } from "@/lib/bank-movements/bank-movement-reconciliation-service.server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false as const, error: "Identificador de movimiento inválido." },
      { status: 400 }
    );
  }

  const parsed = await parseAndValidateJsonBody(request, bankMovementReconcileBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "bank_movements",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  try {
    const data = await reconcileBankMovementWithObligation({
      supabase: auth.ctx.supabase,
      workspaceId: auth.ctx.tenantCompanyId,
      userId: auth.ctx.appUser.id,
      movementId: id,
      targetId: parsed.data.target_id,
      confidence: parsed.data.confidence,
      score: parsed.data.score,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ ok: true as const, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "MOVEMENT_NOT_FOUND" || message === "TARGET_NOT_FOUND") {
      return NextResponse.json(
        { ok: false as const, error: "No se encontró el movimiento o el pago de Tesorería." },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { ok: false as const, error: "No se pudo conciliar el movimiento." },
      { status: 500 }
    );
  }
}
