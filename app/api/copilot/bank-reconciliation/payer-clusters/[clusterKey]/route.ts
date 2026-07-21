import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import { getPayerClusterDetail } from "@/lib/bank/canonical/payer-cluster-audit.server";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/copilot/bank-reconciliation/payer-clusters/[clusterKey]?from=&to=
 *
 * Detalle de movimientos de UN cluster puntual — carga lazy al abrir el
 * drawer de revisión en lote. Solo lectura.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clusterKey: string }> }
) {
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
    const detail = await getPayerClusterDetail(auth.ctx.supabase, {
      workspaceId: auth.ctx.tenantCompanyId,
      from,
      to,
      clusterKey: decodeURIComponent(clusterKey),
    });
    if (!detail) {
      return NextResponse.json({ ok: false as const, error: "CLUSTER_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true as const, data: detail });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: err instanceof Error ? err.message : "PAYER_CLUSTER_DETAIL_FAILED" },
      { status: 500 }
    );
  }
}
