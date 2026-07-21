import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import { listPayerClusterSummaries } from "@/lib/bank/canonical/payer-cluster-audit.server";
import type { EvidenceLevel } from "@/lib/bank/canonical/bank-payer-identification";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVIDENCE_VALUES: EvidenceLevel[] = ["strong", "probable", "ambiguous", "none"];

/**
 * GET /api/copilot/bank-reconciliation/payer-clusters
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD&search=texto&evidence=strong&page=1&pageSize=20
 *
 * Solo lectura, paginado y filtrado server-side: agrupa movimientos de
 * ingreso por identidad de pagador y los cruza contra clientes/recibos
 * reales para proponer identificaciones. No confirma nada, no crea recibos,
 * no modifica facturas. Devuelve solo resúmenes — el detalle de movimientos
 * de un cluster puntual se pide aparte (lazy, al abrir el drawer).
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
  const search = url.searchParams.get("search")?.trim() || undefined;
  const evidenceParam = url.searchParams.get("evidence");
  const evidence =
    evidenceParam && EVIDENCE_VALUES.includes(evidenceParam as EvidenceLevel)
      ? (evidenceParam as EvidenceLevel)
      : undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "20") || 20));

  try {
    const result = await listPayerClusterSummaries(auth.ctx.supabase, {
      workspaceId: auth.ctx.tenantCompanyId,
      from,
      to,
      search,
      evidence,
      page,
      pageSize,
    });
    return NextResponse.json({ ok: true as const, data: { from, to, ...result } });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: err instanceof Error ? err.message : "PAYER_CLUSTER_AUDIT_FAILED" },
      { status: 500 }
    );
  }
}
