import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  buildClientBankAliasPatch,
  clientBankAliasUpdateSchema,
  type ClientBankAlias,
} from "@/lib/bank-movements/client-bank-aliases";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ id: string; aliasId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const parsed = await parseAndValidateJsonBody(request, clientBankAliasUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "clientes");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;
  const { id, aliasId } = await context.params;
  if (!UUID_RE.test(aliasId)) {
    return NextResponse.json({ ok: false, error: "Alias inválido." }, { status: 400 });
  }

  const patch = buildClientBankAliasPatch(parsed.data);
  const { data, error } = await supabase
    .from("client_bank_aliases")
    .update(patch)
    .eq("workspace_id", tenantCompanyId)
    .eq("client_id", id.trim())
    .eq("id", aliasId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un alias igual para este cliente." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: "No se pudo actualizar el alias." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Alias no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, alias: data as ClientBankAlias });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireCopilotModuleWriteAccess(request, "clientes");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;
  const { id, aliasId } = await context.params;
  if (!UUID_RE.test(aliasId)) {
    return NextResponse.json({ ok: false, error: "Alias inválido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_bank_aliases")
    .delete()
    .eq("workspace_id", tenantCompanyId)
    .eq("client_id", id.trim())
    .eq("id", aliasId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudo eliminar el alias." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Alias no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, id: aliasId });
}
