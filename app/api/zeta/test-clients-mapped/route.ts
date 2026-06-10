import { NextRequest, NextResponse } from "next/server";

import { requireZetaSuperAdminAuth } from "@/lib/integrations/zeta/zeta-api-auth";
import { fetchZetaClients } from "@/lib/integrations/zeta/zeta-clients";
import { mapZetaClientToProtoCompanyPreview } from "@/lib/integrations/zeta/zeta-client-mapper";

type TestClientsMappedBody = {
  success: boolean;
  requestUrl: string;
  httpStatus: number | null;
  count: number;
  sample_mapped: ReturnType<typeof mapZetaClientToProtoCompanyPreview>[];
  warnings: string[];
  errors: string[];
};

/**
 * GET /api/zeta/test-clients-mapped
 * Vista previa: clientes Zeta → estructura candidata `proto_companies` (sin escribir en Supabase).
 *
 * Query opcionales: `page`, `esCliente`, `search` (reenviados a `fetchZetaClients`).
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<TestClientsMappedBody>> {
  const auth = await requireZetaSuperAdminAuth(request);
  if (!auth.ok) return auth.response as NextResponse<TestClientsMappedBody>;

  const sp = request.nextUrl.searchParams;
  const page = sp.get("page") ?? undefined;
  const esCliente = sp.get("esCliente") ?? undefined;
  const search = sp.get("search") ?? undefined;

  const result = await fetchZetaClients({ page, esCliente, search });

  const warnings = [...result.warnings];
  const errors = [...result.errors];

  const mappedAll = result.extractedRows.map((row) =>
    mapZetaClientToProtoCompanyPreview(row)
  );

  const missingExternalId = mappedAll.filter((m) => !m.external_id).length;
  if (mappedAll.length > 0 && missingExternalId > 0) {
    warnings.push(
      `${missingExternalId} fila(s) sin Codigo / external_id tras mapping (revisá nombres de campo en Zeta).`
    );
  }

  const nonObjectRows = result.extractedRows.filter(
    (r) => r === null || typeof r !== "object" || Array.isArray(r)
  ).length;
  if (nonObjectRows > 0) {
    warnings.push(
      `${nonObjectRows} elemento(s) en la lista extraída no son objetos; se omitieron campos en el preview.`
    );
  }

  const sample_mapped = mappedAll.slice(0, 10);

  const success = result.ok && errors.length === 0;

  console.info("[Zeta test-clients-mapped]", {
    success,
    requestUrl: result.requestUrl,
    httpStatus: result.httpStatus,
    count: mappedAll.length,
    sampleSize: sample_mapped.length,
  });

  let httpStatusOut = 200;
  if (!success) {
    if (result.httpStatus != null && result.httpStatus >= 400) {
      httpStatusOut = result.httpStatus;
    } else if (
      result.errors.some(
        (e) =>
          e.includes("Falta ZETA") ||
          e.includes("Autenticación Zeta") ||
          e.includes("Connection")
      )
    ) {
      httpStatusOut = 400;
    } else {
      httpStatusOut = 502;
    }
  }

  return NextResponse.json(
    {
      success,
      requestUrl: result.requestUrl,
      httpStatus: result.httpStatus,
      count: mappedAll.length,
      sample_mapped,
      warnings,
      errors,
    },
    { status: httpStatusOut }
  );
}
