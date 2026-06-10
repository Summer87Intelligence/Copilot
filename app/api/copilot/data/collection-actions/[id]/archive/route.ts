import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { collectionArchiveAction } from "@/lib/copilot-collection-service";

const MSG_DB = "Error de base de datos. Intentá de nuevo.";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireCopilotModuleWriteAccess(request, "datos");
    if (!auth.ok) return auth.response;

    const { supabase, tenantCompanyId } = auth.ctx;
    const { id } = await params;

    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION", message: "Falta el id de la acción." },
        { status: 400 }
      );
    }

    const result = await collectionArchiveAction(supabase, id, tenantCompanyId);

    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : result.code === "VALIDATION" ? 400 : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, code: "DATABASE", message: MSG_DB },
      { status: 500 }
    );
  }
}
