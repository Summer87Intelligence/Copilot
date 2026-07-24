import { NextRequest, NextResponse } from "next/server";

import {
  getCopilotModuleAccessLevel,
  requireCopilotModuleAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { bankMovementsScopeFromAccessLevel, mustForceBankInflowOnly } from "@/lib/auth/bank-movements-scope";
import { parseReconciliationListFilters } from "@/lib/bank-movements/bank-movement-reconciliation-api";
import {
  emptyReconciliationListResult,
  loadBankMovementReconciliationList,
} from "@/lib/bank-movements/bank-movement-reconciliation-service.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  // Motor A (Tesorería — pagos programados) concilia EXCLUSIVAMENTE egresos:
  // `inflow_readonly` nunca debe recibir filas, counts, totales ni metadata
  // de acá. El guard corre antes de tocar `bank_movements`/obligaciones — no
  // es un filtro aplicado después sobre el resultado, directamente no se
  // consulta. El parámetro `direction` del request se ignora por completo
  // (mismo patrón que el listado principal de Movimientos): nunca confiar en
  // el cliente para decidir qué egresos exponer.
  const accessLevel = await getCopilotModuleAccessLevel(auth.ctx, "bank_movements");
  const forceInflowOnly = mustForceBankInflowOnly(bankMovementsScopeFromAccessLevel(accessLevel));
  if (forceInflowOnly) {
    return NextResponse.json({ ok: true as const, data: emptyReconciliationListResult() });
  }

  const filters = parseReconciliationListFilters(request.nextUrl.searchParams);

  try {
    const data = await loadBankMovementReconciliationList({
      supabase: auth.ctx.supabase,
      workspaceId: auth.ctx.tenantCompanyId,
      filters,
    });

    return NextResponse.json({
      ok: true as const,
      data,
    });
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo cargar la conciliación bancaria." },
      { status: 500 }
    );
  }
}
