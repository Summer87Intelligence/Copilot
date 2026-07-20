import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { getMovementReconciliationView } from "@/lib/bank-movements/bank-reconciliation-links-repository";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — Motor C RETIRADO como escritor
 * (creaba `bank_movement_reconciliation_links` directo por repositorio,
 * bypaseando `confirm_bank_reconciliation_v1`: sin `payment_allocations`, sin
 * `reconciliation_events`). GET se conserva (lectura del drawer detallado);
 * POST queda retirado server-side, no solo oculto en la UI. Se conserva la
 * validación de módulo/sesión antes del 410 (consistencia RBAC).
 * Ver docs/architecture/bank-reconciliation-canonical-engine.md.
 */
export async function POST(request: NextRequest) {
  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    {
      ok: false as const,
      error:
        "Esta acción quedó retirada. Las conciliaciones de clientes se confirman desde la pestaña Conciliación (motor canónico).",
      code: "LEGACY_WRITE_RETIRED",
    },
    { status: 410 }
  );
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
