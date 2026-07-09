import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import {
  bankMovementCreateBodySchema,
  buildBankMovementInsert,
} from "@/lib/bank-movements/bank-movements-api";
import {
  isValidBankMovementDirection,
  isValidBankMovementStatus,
  type BankMovement,
} from "@/lib/bank-movements/bank-movements-types";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const params = request.nextUrl.searchParams;

  let query = supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);

  const status = params.get("status");
  if (status && status !== "all" && isValidBankMovementStatus(status)) {
    query = query.eq("status", status);
  }
  const direction = params.get("direction");
  if (direction && direction !== "all" && isValidBankMovementDirection(direction)) {
    query = query.eq("direction", direction);
  }
  const currency = params.get("currency");
  if (currency && currency !== "all") query = query.eq("currency", currency);
  const importId = params.get("import_id");
  if (importId) query = query.eq("import_id", importId);

  const { data, error } = await query;

  if (error) {
    if (error.code === TABLE_MISSING_CODE) {
      return NextResponse.json({
        ok: true as const,
        data: [] as BankMovement[],
        meta: { total: 0, migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudieron cargar los movimientos bancarios." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as BankMovement[];
  return NextResponse.json({
    ok: true as const,
    data: rows,
    meta: { total: rows.length, migration_pending: false },
  });
}

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, bankMovementCreateBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "bank_movements",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const insert = buildBankMovementInsert(parsed.data, tenantCompanyId);

  const { data, error } = await supabase
    .from("bank_movements")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo crear el movimiento bancario." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true as const, data: data as BankMovement }, { status: 201 });
}
