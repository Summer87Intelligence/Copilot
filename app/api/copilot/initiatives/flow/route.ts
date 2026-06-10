import { NextRequest, NextResponse } from "next/server";

import type { InitiativeFlowItem } from "@/lib/ai/initiative-flow-types";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";

/**
 * GET /api/copilot/initiatives/flow
 *
 * El flujo basado en iniciativas mock ya no alimenta Copilot. Se mantiene la ruta por compatibilidad
 * y devuelve lista vacía. Usá GET /api/copilot/real-insights.
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const auth = await requireCopilotModuleAccess(request, "acciones");
  if (!auth.ok) {
    log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
    return auth.response;
  }
  log = log.withTenant(auth.ctx.tenantCompanyId);

  return NextResponse.json({ items: [] as InitiativeFlowItem[] });
}
