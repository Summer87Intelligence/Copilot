import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { bankReconciliationLinkCreateBodySchema } from "@/lib/bank-movements/bank-movement-reconciliation-api";
import {
  createReconciliationLink,
  getMovementReconciliationView,
} from "@/lib/bank-movements/bank-reconciliation-links-repository";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mapea el código de resultado del repositorio al status HTTP acordado. */
function statusForCreateCode(code: string): number {
  switch (code) {
    case "INVALID_AMOUNT":
      return 400;
    case "MOVEMENT_NOT_FOUND":
      return 404;
    case "OVER_APPLIED":
    case "DUPLICATE":
    case "MIGRATION_PENDING":
      return 409;
    case "CROSS_CURRENCY":
    case "CROSS_DIRECTION":
      return 422;
    default:
      return 500;
  }
}

export async function GET(
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

  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const result = await getMovementReconciliationView(
    auth.ctx.supabase,
    auth.ctx.tenantCompanyId,
    id
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false as const, error: "Movimiento no encontrado en este workspace." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true as const,
    data: result.view,
    migrationPending: result.migrationPending,
  });
}

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

  const parsed = await parseAndValidateJsonBody(request, bankReconciliationLinkCreateBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "bank_movements",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const result = await createReconciliationLink(
    auth.ctx.supabase,
    auth.ctx.tenantCompanyId,
    auth.ctx.appUser.id,
    {
      movementId: id,
      targetType: parsed.data.target_type,
      targetId: parsed.data.target_id ?? null,
      appliedAmount: parsed.data.applied_amount ?? 0,
      targetCurrency: parsed.data.target_currency,
      targetDirection: parsed.data.target_direction,
      method: parsed.data.method,
      confidence: parsed.data.confidence ?? null,
      note: parsed.data.note ?? null,
    }
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false as const, error: result.message, code: result.code },
      { status: statusForCreateCode(result.code) }
    );
  }

  return NextResponse.json({ ok: true as const, data: { link: result.link, view: result.view } });
}
