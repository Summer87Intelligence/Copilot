import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { SALESPERSON_START_DATE } from "@/lib/sales/canonical/types";
import { clientAssignmentSchema } from "@/lib/sales/sales-salesperson-write";
import { upsertClientSalespersonAssignment } from "@/lib/sales/sales-client-salesperson-repository";

export const dynamic = "force-dynamic";

/**
 * FASE 9D — Asigna (o des-asigna) un comercial a un CLIENTE con vigencia temporal.
 * No reescribe ventas anteriores a validFrom.
 */
export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, clientAssignmentSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  const today = todayYmdMontevideo();
  const validFrom = (parsed.data.validFrom ?? today).slice(0, 10);
  const effectiveFrom = validFrom < SALESPERSON_START_DATE ? SALESPERSON_START_DATE : validFrom;

  // Cliente debe existir en el workspace.
  const { data: company } = await supabase
    .from("proto_companies")
    .select("id")
    .eq("id", parsed.data.customerId)
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (!company) {
    return NextResponse.json(
      { ok: false as const, code: "NOT_FOUND", message: "Cliente no encontrado en este workspace." },
      { status: 404 }
    );
  }

  if (parsed.data.salespersonId) {
    const { data: sp } = await supabase
      .from("sales_salespersons")
      .select("id")
      .eq("id", parsed.data.salespersonId)
      .eq("workspace_id", tenantCompanyId)
      .maybeSingle();
    if (!sp) {
      return NextResponse.json(
        { ok: false as const, code: "NOT_FOUND", message: "Comercial no encontrado en este workspace." },
        { status: 404 }
      );
    }
  }

  const result = await upsertClientSalespersonAssignment(supabase, tenantCompanyId, appUser.id ?? null, {
    customerId: parsed.data.customerId,
    salespersonId: parsed.data.salespersonId,
    validFrom: effectiveFrom,
  });

  if (!result.ok) {
    const status = result.code === "MIGRATION_PENDING" ? 503 : result.code === "OUT_OF_RANGE" ? 422 : 500;
    return NextResponse.json(
      { ok: false as const, code: result.code, message: result.message },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: true as const,
      data: {
        customerId: parsed.data.customerId,
        salespersonId: parsed.data.salespersonId,
        validFrom: effectiveFrom,
      },
    },
    { status: 201 }
  );
}
