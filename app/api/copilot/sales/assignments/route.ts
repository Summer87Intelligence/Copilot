import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { SALESPERSON_START_DATE } from "@/lib/sales/canonical/types";
import { assignmentSchema, buildAssignmentUpsert } from "@/lib/sales/sales-salesperson-write";

export const dynamic = "force-dynamic";

/** Asigna (o des-asigna con salespersonId=null) un comercial a un documento de venta. */
export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, assignmentSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  // El documento debe pertenecer al workspace y ser >= 2026-07-01 (regla de vigencia).
  const { data: doc } = await supabase
    .from("proto_invoices")
    .select("id, issue_date")
    .eq("id", parsed.data.documentId)
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ ok: false as const, code: "NOT_FOUND", message: "Documento no encontrado en este workspace." }, { status: 404 });
  }
  const issueDate = String((doc as { issue_date?: string }).issue_date ?? "").slice(0, 10);
  if (issueDate < SALESPERSON_START_DATE) {
    return NextResponse.json(
      { ok: false as const, code: "OUT_OF_RANGE", message: `La asignación comercial arranca el ${SALESPERSON_START_DATE}. No se pueden asignar ventas anteriores.` },
      { status: 422 }
    );
  }

  // Si se asigna un comercial, debe pertenecer al workspace.
  if (parsed.data.salespersonId) {
    const { data: sp } = await supabase
      .from("sales_salespersons")
      .select("id")
      .eq("id", parsed.data.salespersonId)
      .eq("workspace_id", tenantCompanyId)
      .maybeSingle();
    if (!sp) {
      return NextResponse.json({ ok: false as const, code: "NOT_FOUND", message: "Comercial no encontrado en este workspace." }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("sales_document_salespersons")
    .upsert(buildAssignmentUpsert(parsed.data, tenantCompanyId, appUser.id ?? null), { onConflict: "workspace_id,document_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false as const, message: "No se pudo guardar la asignación." }, { status: 500 });
  }
  return NextResponse.json({ ok: true as const, data }, { status: 201 });
}
