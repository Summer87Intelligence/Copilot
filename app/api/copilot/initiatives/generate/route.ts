import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";

/**
 * POST /api/copilot/initiatives/generate
 *
 * Las oportunidades mock están desactivadas. Los insights viven en GET /api/copilot/real-insights
 * (cálculo en vivo desde datos proto_*).
 */
export async function POST(request: NextRequest) {
  let log = copilotRequestLogger(request);
  const auth = await requireCopilotModuleWriteAccess(request, "acciones");
  if (!auth.ok) {
    log.warn("copilot_auth_failed", { phase: "require_copilot_tenant" });
    return auth.response;
  }
  log = log.withTenant(auth.ctx.tenantCompanyId);
  log.debug("copilot_initiatives_generate_noop", { reason: "mock_disabled" });

  return NextResponse.json({
    inserted: 0,
    omitted: 0,
    rows: [] as unknown[],
    message:
      "Las oportunidades mock están desactivadas. Usá «Actualizar» en Acciones recomendadas para recalcular insights desde tus datos.",
    dedupe_date: null,
    timezone: "America/Montevideo",
  });
}
