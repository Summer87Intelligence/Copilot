import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  buildClientBillingConceptPatch,
  clientBillingConceptUpdateSchema,
  type ClientBillingConcept,
} from "@/lib/bank-movements/client-billing-concepts";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ id: string; conceptId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const parsed = await parseAndValidateJsonBody(request, clientBillingConceptUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "clientes");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;
  const { id, conceptId } = await context.params;
  if (!UUID_RE.test(conceptId)) {
    return NextResponse.json({ ok: false, error: "Concepto inválido." }, { status: 400 });
  }

  const patch = buildClientBillingConceptPatch(parsed.data);
  const { data, error } = await supabase
    .from("client_billing_concepts")
    .update(patch)
    .eq("workspace_id", tenantCompanyId)
    .eq("client_id", id.trim())
    .eq("id", conceptId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudo actualizar el concepto." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Concepto no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, concept: data as ClientBillingConcept });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireCopilotModuleWriteAccess(request, "clientes");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;
  const { id, conceptId } = await context.params;
  if (!UUID_RE.test(conceptId)) {
    return NextResponse.json({ ok: false, error: "Concepto inválido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_billing_concepts")
    .delete()
    .eq("workspace_id", tenantCompanyId)
    .eq("client_id", id.trim())
    .eq("id", conceptId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudo eliminar el concepto." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Concepto no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, id: conceptId });
}
