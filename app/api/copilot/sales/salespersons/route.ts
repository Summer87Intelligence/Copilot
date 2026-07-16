import { NextRequest, NextResponse } from "next/server";

import {
  requireCopilotModuleAccess,
  requireCopilotModuleAdminAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { loadSalespersons } from "@/lib/sales/sales-salesperson-repository";
import { salespersonCreateSchema, buildSalespersonInsert } from "@/lib/sales/sales-salesperson-write";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;

  try {
    const { salespersons, migrationPending } = await loadSalespersons(supabase, tenantCompanyId);
    return NextResponse.json({ ok: true as const, data: salespersons, meta: { migrationPending } });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, message: "No pudimos cargar los comerciales.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, salespersonCreateSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleAdminAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  const { data, error } = await supabase
    .from("sales_salespersons")
    .insert(buildSalespersonInsert(parsed.data, tenantCompanyId, appUser.id ?? null))
    .select("*")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { ok: false as const, message: status === 409 ? "Ya existe un comercial con ese nombre." : "No se pudo crear el comercial." },
      { status }
    );
  }
  return NextResponse.json({ ok: true as const, data }, { status: 201 });
}
