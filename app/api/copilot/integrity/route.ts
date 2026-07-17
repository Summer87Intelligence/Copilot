import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { loadIntegrityReport } from "@/lib/integrity/integrity-source.server";

export const dynamic = "force-dynamic";

/**
 * FASE F — Centro de Integridad y Salud.
 * GET: reporte ejecutivo del workspace (hallazgos clasificados + observabilidad).
 * Gated bajo módulo `admin` (superficie de control operativo/seguridad).
 */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "admin");
  if (!auth.ok) return auth.response;

  try {
    const report = await loadIntegrityReport(auth.ctx.supabase, auth.ctx.tenantCompanyId);
    return NextResponse.json({ ok: true as const, data: report });
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo calcular el reporte de integridad." },
      { status: 500 }
    );
  }
}
