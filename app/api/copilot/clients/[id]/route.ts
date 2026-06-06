import { NextRequest, NextResponse } from "next/server";

import { requireCopilotWriteContext } from "@/lib/copilot-api-auth";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/copilot/clients/:id
 * Updates Copilot-managed fields on a client (proto_companies row).
 * Currently: transfer_method only. Zeta-synced fields are not touched.
 * Requires write permission on the clientes module.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireCopilotWriteContext(request);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;

  const params = await context.params;
  const companyId = params.id?.trim();
  if (!companyId) {
    return NextResponse.json({ ok: false, message: "ID inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body inválido." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ("transfer_method" in b) {
    const val = b.transfer_method;
    if (val !== null && typeof val !== "string") {
      return NextResponse.json({ ok: false, message: "transfer_method debe ser texto o null." }, { status: 400 });
    }
    updates.transfer_method = typeof val === "string" && val.trim() ? val.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, message: "No hay campos a actualizar." }, { status: 400 });
  }

  const { error } = await supabase
    .from("proto_companies")
    .update(updates)
    .eq("id", companyId)
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true);

  if (error) {
    return copilotInternalErrorResponse();
  }

  return NextResponse.json({ ok: true });
}
