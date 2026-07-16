import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAdminAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { classificationCreateSchema, buildClassificationUpsert } from "@/lib/sales/sales-catalog-write";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, classificationCreateSchema);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.status === "classified" && !parsed.data.catalogItemId) {
    return NextResponse.json(
      { ok: false as const, code: "INVALID_COMBINATION", message: "Una clasificación 'classified' requiere un producto." },
      { status: 422 }
    );
  }

  const auth = await requireCopilotModuleAdminAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  const row = buildClassificationUpsert(parsed.data, tenantCompanyId, appUser.id ?? null);

  const { data, error } = await supabase
    .from("sales_line_classifications")
    .upsert(row, { onConflict: "workspace_id,concept_key" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false as const, message: "No se pudo guardar la clasificación." }, { status: 500 });
  }
  return NextResponse.json({ ok: true as const, data }, { status: 201 });
}
