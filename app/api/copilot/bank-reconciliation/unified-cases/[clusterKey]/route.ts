import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import { getUnifiedReconciliationCaseDetail } from "@/lib/bank/canonical/unified-reconciliation-case";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/copilot/bank-reconciliation/unified-cases/[clusterKey]?from=&to=
 *
 * Detalle unificado de un caso (cliente/pagador) — tabla única
 * Fecha|Banco|Recibo|Factura|Estado|Acción. Lazy, solo lectura.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ clusterKey: string }> }) {
  const { clusterKey } = await params;
  const auth = await requireCopilotModuleAccessAny(request, ["bank_movements", "clientes", "cobranza"]);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "2026-01-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ ok: false as const, error: "INVALID_DATE_RANGE" }, { status: 400 });
  }

  try {
    const detail = await getUnifiedReconciliationCaseDetail(auth.ctx.supabase, {
      workspaceId: auth.ctx.tenantCompanyId,
      from,
      to,
      clusterKey: decodeURIComponent(clusterKey),
    });
    if (!detail) {
      return NextResponse.json({ ok: false as const, error: "CASE_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true as const, data: detail });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: err instanceof Error ? err.message : "UNIFIED_CASE_DETAIL_FAILED" },
      { status: 500 }
    );
  }
}
