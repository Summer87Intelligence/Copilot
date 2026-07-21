import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import { buildPayerClusterAudit } from "@/lib/bank/canonical/payer-cluster-audit.server";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/copilot/bank-reconciliation/payer-clusters?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Solo lectura: agrupa movimientos de ingreso por identidad de pagador y los
 * cruza contra clientes/recibos reales para proponer identificaciones. No
 * confirma nada, no crea recibos, no modifica facturas.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccessAny(request, ["bank_movements", "clientes", "cobranza"]);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "2026-01-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ ok: false as const, error: "INVALID_DATE_RANGE" }, { status: 400 });
  }

  try {
    const clusters = await buildPayerClusterAudit(auth.ctx.supabase, {
      workspaceId: auth.ctx.tenantCompanyId,
      from,
      to,
    });
    return NextResponse.json({ ok: true as const, data: { from, to, clusters } });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: err instanceof Error ? err.message : "PAYER_CLUSTER_AUDIT_FAILED" },
      { status: 500 }
    );
  }
}
