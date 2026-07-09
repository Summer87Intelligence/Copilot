import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import type { BankMovementMatchSuggestion } from "@/lib/bank-movements/bank-movements-types";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false as const, message: "Identificador de movimiento inválido." },
      { status: 400 }
    );
  }

  const { supabase, tenantCompanyId } = auth.ctx;

  const { data, error } = await supabase
    .from("bank_movement_match_suggestions")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("bank_movement_id", id)
    .order("confidence", { ascending: false })
    .limit(50);

  if (error) {
    if (error.code === TABLE_MISSING_CODE) {
      return NextResponse.json({
        ok: true as const,
        data: [] as BankMovementMatchSuggestion[],
        meta: { total: 0, migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudieron cargar las sugerencias." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as BankMovementMatchSuggestion[];
  return NextResponse.json({
    ok: true as const,
    data: rows,
    meta: { total: rows.length, migration_pending: false },
  });
}
