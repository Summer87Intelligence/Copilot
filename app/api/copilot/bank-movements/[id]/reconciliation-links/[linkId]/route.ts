import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";

export const dynamic = "force-dynamic";

/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — Motor C RETIRADO como escritor.
 * Este endpoint archivaba `bank_movement_reconciliation_links` directo (bypaseando
 * `reverse_bank_reconciliation_v1`: sin revertir `payment_allocations`, sin
 * `reconciliation_events`). Guardado server-side además de ocultar el botón en
 * la UI, para que una llamada directa tampoco pueda escribir por este camino.
 * Se conserva la validación de módulo/sesión antes del 410 (consistencia RBAC).
 * Ver docs/architecture/bank-reconciliation-canonical-engine.md.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    {
      ok: false as const,
      error:
        "Esta acción quedó retirada. Las conciliaciones de clientes se revierten desde la pestaña Conciliación (motor canónico).",
      code: "LEGACY_WRITE_RETIRED",
    },
    { status: 410 }
  );
}
