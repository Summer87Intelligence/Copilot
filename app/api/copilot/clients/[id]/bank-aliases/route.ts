import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import {
  buildClientBankAliasInsert,
  clientBankAliasCreateSchema,
  type ClientBankAlias,
} from "@/lib/bank-movements/client-bank-aliases";

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
    .from("client_bank_aliases")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("client_id", id.trim())
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudieron cargar los alias." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, aliases: (data ?? []) as ClientBankAlias[] });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = await parseAndValidateJsonBody(request, clientBankAliasCreateSchema);
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

  const insert = buildClientBankAliasInsert(parsed.data, {
    workspaceId: tenantCompanyId,
    clientId: id.trim(),
    userId: appUser.id,
  });

  const { data, error } = await supabase
    .from("client_bank_aliases")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un alias igual para este cliente." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: "No se pudo crear el alias." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, alias: data as ClientBankAlias }, { status: 201 });
}
