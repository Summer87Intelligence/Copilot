import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { loadReconciliationSuggestionsForMovement } from "@/lib/bank-movements/bank-reconciliation-suggestions-repository.server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const result = await loadReconciliationSuggestionsForMovement({
    supabase: auth.ctx.supabase,
    workspaceId: auth.ctx.tenantCompanyId,
    movementId: id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false as const, error: "Movimiento no encontrado en este workspace." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true as const,
    data: {
      remaining: result.remaining,
      suggestions: result.suggestions,
    },
    migrationPending: result.migrationPending,
  });
}
