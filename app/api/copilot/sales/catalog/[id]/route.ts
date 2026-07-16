import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAdminAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { catalogItemUpdateSchema, buildItemUpdate } from "@/lib/sales/sales-catalog-write";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = await parseAndValidateJsonBody(request, catalogItemUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleAdminAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;

  const patch = buildItemUpdate(parsed.data);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false as const, code: "EMPTY_PATCH", message: "No hay cambios para aplicar." }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("sales_catalog_items")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", tenantCompanyId)
    .select("*")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ ok: false as const, message: status === 409 ? "Ya existe un producto con ese nombre." : "No se pudo actualizar el producto." }, { status });
  }
  if (!data) {
    return NextResponse.json({ ok: false as const, code: "NOT_FOUND", message: "Producto no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true as const, data });
}
