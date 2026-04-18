import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoDeleteInvoice } from "@/lib/copilot-proto-crud-service";

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;

    const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "Falta el identificador de la factura a eliminar.",
        },
        { status: 400 }
      );
    }
    const result = await protoDeleteInvoice(auth.ctx.supabase, id);
    return nextResponseFromProtoCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
