import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { SUCCESSFUL_BANK_IMPORT_STATUSES } from "@/lib/bank-movements/bank-movements-types";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";

export async function GET(request: NextRequest) {
  // Este endpoint alimenta únicamente el encabezado. inflow_readonly puede
  // conocer la fecha de actualización de su propio tenant, pero no obtiene
  // filas, archivos, contadores ni metadata del Historial.
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const { data, error } = await supabase
    .from("bank_statement_imports")
    .select("imported_at")
    .eq("workspace_id", tenantCompanyId)
    .in("status", [...SUCCESSFUL_BANK_IMPORT_STATUSES])
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === TABLE_MISSING_CODE) {
      return NextResponse.json({
        ok: true as const,
        data: { imported_at: null },
        meta: { migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudo cargar la última actualización bancaria." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true as const,
    data: { imported_at: data?.imported_at ?? null },
  });
}
