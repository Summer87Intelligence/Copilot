import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { cobranzaRegistrarCobroBodySchema } from "@/lib/api/schemas/cobranza-registrar-cobro-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { registrarCobro } from "@/lib/cobranza/registrar-cobro-service";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseAndValidateJsonBody(request, cobranzaRegistrarCobroBodySchema);
    if (!parsed.ok) return parsed.response;

    const auth = await requireCopilotModuleWriteAccess(
      request,
      "acciones",
      parsed.data as Record<string, unknown>
    );
    if (!auth.ok) return auth.response;

    const result = await registrarCobro(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      parsed.data
    );

    if (!result.ok) {
      const status =
        result.code === "VALIDATION"
          ? 400
          : result.code === "NOT_FOUND"
            ? 404
            : result.code === "PARTIAL"
              ? 207
              : 500;
      return NextResponse.json(result, { status });
    }

    const status = result.idempotent ? 200 : 201;
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
