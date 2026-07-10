import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import {
  buildClientBillingConceptInsert,
  clientBillingConceptCreateSchema,
  type ClientBillingConcept,
} from "@/lib/bank-movements/client-billing-concepts";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireCopilotModuleAccess(request, "clientes");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;
  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "ID de cliente requerido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_billing_concepts")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("client_id", id.trim())
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudieron cargar los conceptos." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, concepts: (data ?? []) as ClientBillingConcept[] });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = await parseAndValidateJsonBody(request, clientBillingConceptCreateSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "clientes");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "ID de cliente requerido." }, { status: 400 });
  }

  const { data: company } = await supabase
    .from("proto_companies")
    .select("id")
    .eq("id", id.trim())
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ ok: false, error: "Cliente no encontrado." }, { status: 404 });
  }

  const insert = buildClientBillingConceptInsert(parsed.data, {
    workspaceId: tenantCompanyId,
    clientId: id.trim(),
    userId: appUser.id,
  });

  const { data, error } = await supabase
    .from("client_billing_concepts")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudo crear el concepto." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, concept: data as ClientBillingConcept }, { status: 201 });
}
