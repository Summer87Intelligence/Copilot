import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireZetaCopilotAuth } from "@/lib/integrations/zeta/zeta-api-auth";
import { syncZetaVendorPayments } from "@/lib/integrations/zeta/zeta-vendor-payments-pipeline";

const bodySchema = z
  .object({
    mes: z.coerce.number().int().min(1).max(12),
    anio: z.coerce.number().int().min(2000).max(2100),
    proveedorCodigo: z.string().trim().max(32).optional(),
    comprobanteCodigo: z.string().trim().max(32).optional(),
    monedaCodigo: z.string().trim().max(16).optional(),
    localCodigo: z.string().trim().max(32).optional(),
  })
  .strict();

/**
 * POST /api/zeta/sync-vendor-payments
 * Solo lectura en Zeta (`QueryComprobantes`); persiste en `proto_payments`.
 */
export async function POST(request: NextRequest) {
  const pv = await parseAndValidateJsonBody(request, bodySchema);
  if (!pv.ok) return pv.response;

  const auth = await requireZetaCopilotAuth(request, pv.data as Record<string, unknown>);
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
  const requestId = globalThis.crypto?.randomUUID?.() ?? `sync-vendor-payments-${Date.now()}`;

  const outcome = await syncZetaVendorPayments({
    supabase: auth.ctx.supabase,
    workspaceCompanyId: tenantId,
    ctx: { requestId, tenantId },
    filters: {
      mes: String(d.mes),
      anio: String(d.anio),
      proveedorCodigo: d.proveedorCodigo,
      comprobanteCodigo: d.comprobanteCodigo,
      monedaCodigo: d.monedaCodigo,
      localCodigo: d.localCodigo,
    },
  });

  const status = outcome.success ? 200 : outcome.errors > 0 ? 502 : 500;

  return NextResponse.json(
    {
      success: outcome.success,
      processed: outcome.processed,
      inserted: outcome.inserted,
      updated: outcome.updated,
      skipped: outcome.skipped,
      errors: outcome.errors,
      persisted_total: outcome.persisted_total ?? 0,
      invalid_date_rows: outcome.invalid_date_rows ?? 0,
      invalid_amount_rows: outcome.invalid_amount_rows ?? 0,
      negative_amount_rows: outcome.negative_amount_rows ?? 0,
      pre_operational_rows: outcome.pre_operational_rows ?? 0,
      duration_ms: outcome.duration_ms,
    },
    { status }
  );
}
