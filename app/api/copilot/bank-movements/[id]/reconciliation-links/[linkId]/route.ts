import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  archiveReconciliationLink,
  getMovementReconciliationView,
} from "@/lib/bank-movements/bank-reconciliation-links-repository";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deshacer conciliación = archivar (auditable, nunca borra). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { id, linkId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(linkId)) {
    return NextResponse.json(
      { ok: false as const, error: "Identificador inválido." },
      { status: 400 }
    );
  }

  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const archived = await archiveReconciliationLink(
    auth.ctx.supabase,
    auth.ctx.tenantCompanyId,
    linkId
  );
  if (!archived.ok) {
    const status = archived.code === "NOT_FOUND" ? 404 : archived.code === "MIGRATION_PENDING" ? 409 : 500;
    return NextResponse.json({ ok: false as const, error: archived.message, code: archived.code }, { status });
  }

  const view = await getMovementReconciliationView(auth.ctx.supabase, auth.ctx.tenantCompanyId, id);
  return NextResponse.json({
    ok: true as const,
    data: view.ok ? view.view : null,
  });
}
