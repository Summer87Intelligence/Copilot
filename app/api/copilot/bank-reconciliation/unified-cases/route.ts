import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import { listUnifiedReconciliationCases, type UnifiedCaseStatus } from "@/lib/bank/canonical/unified-reconciliation-case";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_VALUES: UnifiedCaseStatus[] = [
  "sin_cliente",
  "listo_para_confirmar",
  "revision_parcial",
  "falta_recibo",
  "requiere_revision",
  "conciliado",
];

/**
 * GET /api/copilot/bank-reconciliation/unified-cases
 *   ?from=&to=&search=&status=listo_para_confirmar&page=1&pageSize=20
 *
 * FASE BANK-RECONCILIATION-SIMPLE-UNIFIED-WORKSPACE-001 — reemplaza los dos
 * pasos manuales (Identificar clientes / Vincular recibos) por una única
 * lista de "casos" por cliente/pagador. Solo lectura: compone
 * listPayerClusterSummaries (mismo motor ya usado por payer-clusters) y
 * nunca escribe nada.
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
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && STATUS_VALUES.includes(statusParam as UnifiedCaseStatus) ? (statusParam as UnifiedCaseStatus) : undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "20") || 20));

  try {
    const result = await listUnifiedReconciliationCases(auth.ctx.supabase, {
      workspaceId: auth.ctx.tenantCompanyId,
      from,
      to,
      search,
      status,
      page,
      pageSize,
    });
    return NextResponse.json({ ok: true as const, data: { from, to, ...result } });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: err instanceof Error ? err.message : "UNIFIED_CASES_FAILED" },
      { status: 500 }
    );
  }
}
