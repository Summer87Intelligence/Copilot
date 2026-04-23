import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { runZetaContactsInitialImport } from "@/lib/integrations/zeta/zeta-contact-import-run";

const bodySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    page: z.string().trim().min(1).optional(),
    esCliente: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
  })
  .strict();

/**
 * POST /api/zeta/import-contacts-initial
 * Carga Zeta (`RESTContactosV3Query`) → `proto_contacts` (INSERT), vinculando a `proto_companies` por Codigo o RUT.
 */
export async function POST(request: NextRequest) {
  const pv = await parseAndValidateJsonBody(request, bodySchema);
  if (!pv.ok) return pv.response;

  const auth = await requireCopilotTenantContext(
    request,
    pv.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const tenantId = auth.ctx.tenantCompanyId?.trim();
  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "FORBIDDEN_TENANT",
        message: "Falta workspace_company_id (tenant) en el contexto de sesión.",
      },
      { status: 403 }
    );
  }

  const result = await runZetaContactsInitialImport(auth.ctx.supabase, tenantId, {
    limit: pv.data.limit,
    page: pv.data.page,
    esCliente: pv.data.esCliente,
    search: pv.data.search,
  });

  const httpStatus =
    result.errors.length > 0 && !result.inserted
      ? result.zeta_http_status != null &&
          result.zeta_http_status >= 400 &&
          result.zeta_http_status <= 599
        ? result.zeta_http_status
        : 502
      : 200;

  console.info("[Zeta import-contacts-initial API]", {
    tenant: tenantId,
    inserted: result.inserted,
    processed: result.processed,
    total_zeta_rows: result.total_zeta_rows,
    zeta_rows_extraction_path: result.zeta_rows_extraction_path,
    warnings: result.warnings.length,
  });

  return NextResponse.json(
    {
      ok: result.ok && result.errors.length === 0,
      workspace_company_id: result.workspace_company_id,
      summary: {
        total_zeta_rows: result.total_zeta_rows,
        batch_limit: result.batch_limit,
        processed: result.processed,
        inserted: result.inserted,
        skipped_duplicate: result.skipped_duplicate,
        skipped_no_company: result.skipped_no_company,
        skipped_missing_identity: result.skipped_missing_identity,
        skipped_errors: result.skipped_errors,
      },
      warnings: result.warnings,
      errors: result.errors,
      inserted_ids: result.inserted_ids,
      zeta_request_url: result.zeta_request_url,
      zeta_http_status: result.zeta_http_status,
      zeta_rows_extraction_path: result.zeta_rows_extraction_path,
    },
    { status: httpStatus }
  );
}
