import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { syncZetaCollectionReceipts } from "@/lib/integrations/zeta/zeta-collection-receipts-pipeline";

const bodySchema = z
  .object({
    mes: z.coerce.number().int().min(1).max(12),
    anio: z.coerce.number().int().min(2000).max(2100),
    clienteCodigo: z.string().trim().max(32).optional(),
    comprobanteCodigo: z.string().trim().max(32).optional(),
    monedaCodigo: z.string().trim().max(16).optional(),
    localCodigo: z.string().trim().max(32).optional(),
    cobradorCodigo: z.string().trim().max(32).optional(),
  })
  .strict();

/**
 * POST /api/zeta/sync-collection-receipts
 * Solo lectura en Zeta (`QueryComprobantes`); persiste en `proto_receipts` en Copilot.
 */
export async function POST(request: NextRequest) {
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
  const requestId = globalThis.crypto?.randomUUID?.() ?? `sync-collection-receipts-${Date.now()}`;

  const outcome = await syncZetaCollectionReceipts({
    supabase: auth.ctx.supabase,
    workspaceCompanyId: tenantId,
    ctx: { requestId, tenantId },
    filters: {
      mes: String(d.mes),
      anio: String(d.anio),
      clienteCodigo: d.clienteCodigo,
      comprobanteCodigo: d.comprobanteCodigo,
      monedaCodigo: d.monedaCodigo,
      localCodigo: d.localCodigo,
      cobradorCodigo: d.cobradorCodigo,
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
      unlinked_client_rows: outcome.unlinked_client_rows ?? 0,
      invalid_date_rows: outcome.invalid_date_rows ?? 0,
      invalid_amount_rows: outcome.invalid_amount_rows ?? 0,
      negative_amount_rows: outcome.negative_amount_rows ?? 0,
      duration_ms: outcome.duration_ms,
    },
    { status }
  );
}
