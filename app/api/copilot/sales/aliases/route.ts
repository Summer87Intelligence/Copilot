import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAdminAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { aliasCreateSchema, buildAliasInsert } from "@/lib/sales/sales-catalog-write";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, aliasCreateSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleAdminAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  // El item debe pertenecer al workspace (defensa cross-workspace).
  const { data: item } = await supabase
    .from("sales_catalog_items")
    .select("id")
    .eq("id", parsed.data.catalogItemId)
    .eq("workspace_id", tenantCompanyId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ ok: false as const, code: "NOT_FOUND", message: "Producto no encontrado en este workspace." }, { status: 404 });
  }

  const row = buildAliasInsert(parsed.data, tenantCompanyId, appUser.id ?? null);
  const { data, error } = await supabase
    .from("sales_catalog_aliases")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { ok: false as const, code: status === 409 ? "ALIAS_CONFLICT" : "ALIAS_ERROR", message: status === 409 ? "Ya existe un alias equivalente activo." : "No se pudo crear el alias." },
      { status }
    );
  }
  return NextResponse.json({ ok: true as const, data }, { status: 201 });
}
