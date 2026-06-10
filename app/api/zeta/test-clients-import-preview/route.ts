import { NextRequest, NextResponse } from "next/server";

import { requireZetaSuperAdminAuth } from "@/lib/integrations/zeta/zeta-api-auth";
import {
  PROTO_COMPANIES_FETCH_CAP,
  classifyZetaImportDryRun,
  fetchProtoCompaniesForWorkspaceDryRun,
  sliceSamplesByCategory,
  type ZetaImportDryRunRow,
} from "@/lib/integrations/zeta/zeta-client-import-preview";
import { fetchZetaClients } from "@/lib/integrations/zeta/zeta-clients";
import { mapZetaClientToProtoCompanyPreview } from "@/lib/integrations/zeta/zeta-client-mapper";

const SAMPLE_PER_CATEGORY = 10;

type ImportPreviewResponse = {
  success: boolean;
  workspace_company_id: string;
  total_zeta_clients: number;
  summary: {
    would_insert: number;
    would_update_by_external_id: number;
    would_update_by_rut: number;
    unmatched_without_rut: number;
  };
  proto_companies_row_count: number;
  proto_companies_truncated: boolean;
  proto_column_hints: {
    has_any_external_column: boolean;
    has_any_rut_column: boolean;
    sample_keys: string[];
  };
  sample_would_insert: ZetaImportDryRunRow[];
  sample_would_update_by_external_id: ZetaImportDryRunRow[];
  sample_would_update_by_rut: ZetaImportDryRunRow[];
  sample_unmatched_without_rut: ZetaImportDryRunRow[];
  warnings: string[];
  errors: string[];
  zeta_request_url: string;
  zeta_http_status: number | null;
};

/**
 * GET /api/zeta/test-clients-import-preview
 * Dry-run tenant-scoped: Zeta → mapping → comparación con `proto_companies` del workspace (sin INSERT/UPDATE).
 */
export async function GET(request: NextRequest) {
  const auth = await requireZetaSuperAdminAuth(request);
  if (!auth.ok) return auth.response;

  const tenantId = auth.ctx.tenantCompanyId;
  const sp = request.nextUrl.searchParams;

  const zetaResult = await fetchZetaClients({
    page: sp.get("page") ?? undefined,
    esCliente: sp.get("esCliente") ?? undefined,
    search: sp.get("search") ?? undefined,
  });

  const warnings: string[] = [...zetaResult.warnings];
  const errors: string[] = [...zetaResult.errors];

  const previews = zetaResult.extractedRows.map((row) =>
    mapZetaClientToProtoCompanyPreview(row)
  );
  const total_zeta_clients = previews.length;

  const protoFetch = await fetchProtoCompaniesForWorkspaceDryRun(
    auth.ctx.supabase,
    tenantId
  );

  if (protoFetch.error) {
    errors.push(`No se pudo leer proto_companies: ${protoFetch.error}`);
  }
  if (protoFetch.truncated) {
    warnings.push(
      `proto_companies: lectura limitada a ${PROTO_COMPANIES_FETCH_CAP} filas para este dry-run; puede haber más clientes en el tenant.`
    );
  }
  if (!protoFetch.hints.hasAnyExternalColumn) {
    warnings.push(
      "proto_companies: no hay columnas reconocidas para código Zeta (p. ej. Codigo, external_id_zeta, zeta_codigo). El bucket would_update_by_external_id dependerá de que existan esas columnas con datos."
    );
  }
  if (!protoFetch.hints.hasAnyRutColumn) {
    warnings.push(
      "proto_companies: no hay columnas reconocidas para RUT/documento (p. ej. RUT, rut, tax_id). El bucket would_update_by_rut puede quedar vacío."
    );
  }

  const classified = classifyZetaImportDryRun(previews, protoFetch.rows);
  warnings.push(...classified.indexWarnings);

  const samples = sliceSamplesByCategory(classified.rows, SAMPLE_PER_CATEGORY);

  const success = errors.length === 0 && zetaResult.ok;

  let httpStatus = 200;
  if (!success) {
    if (zetaResult.httpStatus != null && zetaResult.httpStatus >= 400) {
      httpStatus = zetaResult.httpStatus;
    } else if (
      errors.some(
        (e) =>
          e.includes("Falta ZETA") ||
          e.includes("Autenticación Zeta") ||
          e.includes("Connection")
      )
    ) {
      httpStatus = 400;
    } else {
      httpStatus = 502;
    }
  }

  console.info("[Zeta test-clients-import-preview]", {
    tenantId,
    success,
    total_zeta_clients,
    summary: classified.summary,
    protoRows: protoFetch.rows.length,
  });

  const body: ImportPreviewResponse = {
      success,
      workspace_company_id: tenantId,
      total_zeta_clients,
      summary: classified.summary,
      proto_companies_row_count: protoFetch.rows.length,
      proto_companies_truncated: protoFetch.truncated,
      proto_column_hints: {
        has_any_external_column: protoFetch.hints.hasAnyExternalColumn,
        has_any_rut_column: protoFetch.hints.hasAnyRutColumn,
        sample_keys: protoFetch.hints.sampleKeys,
      },
      sample_would_insert: samples.would_insert,
      sample_would_update_by_external_id: samples.would_update_by_external_id,
      sample_would_update_by_rut: samples.would_update_by_rut,
      sample_unmatched_without_rut: samples.unmatched_without_rut,
      warnings,
      errors,
      zeta_request_url: zetaResult.requestUrl,
      zeta_http_status: zetaResult.httpStatus,
  };

  return NextResponse.json(body, { status: httpStatus });
}
