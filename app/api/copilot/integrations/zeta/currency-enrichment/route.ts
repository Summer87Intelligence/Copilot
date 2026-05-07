import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { runCurrencyEnrichmentPipeline } from "@/lib/integrations/zeta/zeta-currency-enrichment-pipeline";

/**
 * POST /api/copilot/integrations/zeta/currency-enrichment
 *
 * Body: { "mes": "4", "anio": "2026" }
 *
 * Enriquece currency_code + zeta_metadata.moneda_codigo/moneda_simbolo
 * desde RESTFacturaClienteV4VentasDetalladas. Solo actualiza moneda.
 * NO toca montos, fechas ni clientes.
 */
export async function POST(request: NextRequest) {
  const auth = await requireCopilotTenantContext(request, {});
  if (!auth.ok) return auth.response;

  let mes: string;
  let anio: string;
  try {
    const body = await request.json() as Record<string, unknown>;
    mes = String(body.mes ?? "").trim();
    anio = String(body.anio ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalido" }, { status: 400 });
  }

  if (!/^\d{1,2}$/.test(mes) || Number(mes) < 1 || Number(mes) > 12) {
    return NextResponse.json({ ok: false, error: "mes debe ser 1-12" }, { status: 400 });
  }
  if (!/^\d{4}$/.test(anio)) {
    return NextResponse.json({ ok: false, error: "anio debe ser AAAA" }, { status: 400 });
  }

  const requestId = randomUUID();
  const result = await runCurrencyEnrichmentPipeline(
    auth.ctx.supabase,
    auth.ctx.tenantCompanyId,
    { requestId, tenantId: auth.ctx.tenantCompanyId },
    { mes, anio }
  );

  return NextResponse.json({ request_id: requestId, ...result }, { status: result.ok ? 200 : 422 });
}
