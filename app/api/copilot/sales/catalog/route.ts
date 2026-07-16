import { NextRequest, NextResponse } from "next/server";

import {
  requireCopilotModuleAccess,
  requireCopilotModuleAdminAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { loadSalesCatalogView } from "@/lib/sales/sales-catalog-repository";
import {
  catalogCreateSchema,
  buildCategoryInsert,
  buildItemInsert,
  buildSelfAliasInsert,
} from "@/lib/sales/sales-catalog-write";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "ventas");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;

  try {
    const { view, migrationPending } = await loadSalesCatalogView(supabase, tenantCompanyId);
    return NextResponse.json({ ok: true as const, data: view, meta: { migrationPending } });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, message: "No pudimos cargar el catálogo de ventas.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, catalogCreateSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleAdminAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const userId = appUser.id ?? null;

  if (parsed.data.kind === "category") {
    const { data, error } = await supabase
      .from("sales_catalog_categories")
      .insert(buildCategoryInsert(parsed.data, tenantCompanyId, userId))
      .select("*")
      .single();
    if (error) {
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json({ ok: false as const, message: status === 409 ? "Ya existe una categoría con ese nombre." : "No se pudo crear la categoría." }, { status });
    }
    return NextResponse.json({ ok: true as const, data }, { status: 201 });
  }

  // item
  const { data: item, error } = await supabase
    .from("sales_catalog_items")
    .insert(buildItemInsert(parsed.data, tenantCompanyId, userId))
    .select("*")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ ok: false as const, message: status === 409 ? "Ya existe un producto con ese nombre." : "No se pudo crear el producto." }, { status });
  }

  if (parsed.data.createSelfAlias && item?.id) {
    await supabase
      .from("sales_catalog_aliases")
      .insert(buildSelfAliasInsert(String(item.id), parsed.data.name, tenantCompanyId, userId));
  }

  return NextResponse.json({ ok: true as const, data: item }, { status: 201 });
}
