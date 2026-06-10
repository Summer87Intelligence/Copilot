import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoDeleteTaxObligation } from "@/lib/copilot-proto-crud-service";

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleWriteAccess(request, "datos");
    if (!auth.ok) return auth.response;

    const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "Falta el identificador de la obligación a eliminar.",
        },
        { status: 400 }
      );
    }
    const result = await protoDeleteTaxObligation(
      auth.ctx.supabase,
      id,
      auth.ctx.tenantCompanyId
    );
    return nextResponseFromProtoCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
