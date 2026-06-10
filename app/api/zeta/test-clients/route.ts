import { NextRequest, NextResponse } from "next/server";

import { requireZetaSuperAdminAuth } from "@/lib/integrations/zeta/zeta-api-auth";
import { fetchZetaClients } from "@/lib/integrations/zeta/zeta-clients";

const FULL_PAYLOAD_MAX_CHARS = 12_000;

type TestClientsBody = {
  success: boolean;
  requestUrl: string;
  httpStatus: number | null;
  clientCount: number;
  sample: unknown[];
  warnings: string[];
  errors: string[];
  /** Solo si el JSON crudo es suficientemente chico (inspección). */
  fullPayloadIncluded?: boolean;
  rawText?: string;
  /** Tipo superficial de la raíz parseada. */
  parsedRootHint?: string;
};

/**
 * GET /api/zeta/test-clients
 * Diagnóstico: llama a Zeta `RESTContactosV3Query`, loguea URL/status/estructura, devuelve muestra sin escribir en BD.
 *
 * Query opcionales: `page`, `esCliente` (default S), `search`.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<TestClientsBody>> {
  const auth = await requireZetaSuperAdminAuth(request);
  if (!auth.ok) return auth.response as NextResponse<TestClientsBody>;

  const sp = request.nextUrl.searchParams;
  const page = sp.get("page") ?? undefined;
  const esCliente = sp.get("esCliente") ?? undefined;
  const search = sp.get("search") ?? undefined;

  const result = await fetchZetaClients({ page, esCliente, search });

  const clientCount = result.extractedRows.length;
  const sample = result.extractedRows.slice(0, 5);

  const raw = result.rawText ?? "";
  const includeFull = raw.length > 0 && raw.length <= FULL_PAYLOAD_MAX_CHARS;

  let parsedRootHint: string | undefined;
  const pj = result.parsedJson;
  if (pj == null) parsedRootHint = "null";
  else if (Array.isArray(pj)) parsedRootHint = "array";
  else if (typeof pj === "object") parsedRootHint = `object:${Object.keys(pj).join(",")}`;
  else parsedRootHint = typeof pj;

  console.info("[Zeta test-clients] resumen", {
    success: result.ok && result.errors.length === 0,
    requestUrl: result.requestUrl,
    httpStatus: result.httpStatus,
    clientCount,
    parsedRootHint,
    errors: result.errors,
    warnings: result.warnings,
  });

  const success = result.ok && result.errors.length === 0;

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
      clientCount,
      sample,
      warnings: result.warnings,
      errors: result.errors,
      ...(includeFull
        ? { fullPayloadIncluded: true, rawText: raw }
        : { fullPayloadIncluded: false }),
      parsedRootHint,
    },
    { status: httpStatusOut }
  );
}
