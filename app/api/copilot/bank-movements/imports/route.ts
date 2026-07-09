import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import type { BankStatementImport } from "@/lib/bank-movements/bank-movements-types";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;

  const { data, error } = await supabase
    .from("bank_statement_imports")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .order("imported_at", { ascending: false })
    .limit(100);

  if (error) {
    if (error.code === TABLE_MISSING_CODE) {
      return NextResponse.json({
        ok: true as const,
        data: [] as BankStatementImport[],
        meta: { total: 0, migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudieron cargar las importaciones." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as BankStatementImport[];
  return NextResponse.json({
    ok: true as const,
    data: rows,
    meta: { total: rows.length, migration_pending: false },
  });
}
