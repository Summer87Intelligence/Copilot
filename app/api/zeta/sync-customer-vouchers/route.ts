import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { syncZetaCustomerVouchers } from "@/lib/integrations/zeta/zeta-customer-vouchers-pipeline";

const bodySchema = z
  .object({
    mes: z.coerce.number().int().min(1).max(12),
    anio: z.coerce.number().int().min(2000).max(2100),
    clienteCodigo: z.string().trim().max(20).optional(),
    fechaDesde: z.string().trim().max(32).optional(),
    fechaHasta: z.string().trim().max(32).optional(),
  })
  .strict();

/**
 * POST /api/zeta/sync-customer-vouchers
 * Solo lectura en Zeta (Query); persiste en `proto_invoices` en Copilot.
 */
export async function POST(request: NextRequest) {
  console.log("🔥 ROUTE HIT");
  const pv = await parseAndValidateJsonBody(request, bodySchema);
  if (!pv.ok) return pv.response;

  const auth = await requireCopilotTenantContext(request, pv.data as Record<string, unknown>);
  if (!auth.ok) return auth.response;

  const tenantId = auth.ctx.tenantCompanyId?.trim();
  if (!tenantId) {
    return NextResponse.json(
      {
        success: false,
        processed: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: 1,
        duration_ms: 0,
      },
      { status: 403 }
    );
  }

  const d = pv.data;
  const requestId = globalThis.crypto?.randomUUID?.() ?? `sync-vouchers-${Date.now()}`;

  console.log("🔥 LAYER:", "app/api/zeta/sync-customer-vouchers/route.ts → syncZetaCustomerVouchers()");
  const outcome = await syncZetaCustomerVouchers({
    supabase: auth.ctx.supabase,
    workspaceCompanyId: tenantId,
    ctx: { requestId, tenantId },
    filters: {
      mes: String(d.mes),
      anio: String(d.anio),
      clienteCodigo: d.clienteCodigo,
      fechaDesde: d.fechaDesde,
      fechaHasta: d.fechaHasta,
    },
  });

  const ec = outcome.error_code;
  let status = 500;
  if (outcome.success) {
    status = 200;
  } else if (ec === "validation") {
    status = 400;
  } else if (
    ec === "zeta_http" ||
    ec === "zeta_shape" ||
    ec === "zeta_rate_limit" ||
    ec === "zeta_timeout" ||
    ec === "zeta_unknown" ||
    ec === "zeta_config"
  ) {
    status = 502;
  } else if (outcome.errors > 0) {
    status = 502;
  }

  const body: Record<string, unknown> = {
    success: outcome.success,
    processed: outcome.processed,
    inserted: outcome.inserted,
    updated: outcome.updated,
    skipped: outcome.skipped,
    errors: outcome.errors,
    duration_ms: outcome.duration_ms,
    zeta_method: outcome.zeta_method,
  };
  if (outcome.root_in_key) body.root_in_key = outcome.root_in_key;
  if (!outcome.success) {
    body.error = outcome.error ?? outcome.message ?? "Error desconocido";
    if (outcome.error_code) body.error_code = outcome.error_code;
    if (outcome.details && Object.keys(outcome.details).length > 0) {
      body.details = outcome.details;
    }
  }

  return NextResponse.json(body, { status });
}
