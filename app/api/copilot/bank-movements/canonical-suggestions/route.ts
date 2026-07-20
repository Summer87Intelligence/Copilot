import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { listCanonicalOperationalEvidence } from "@/lib/bank/canonical/canonical-suggestion-evidence";
import { countOperationalConfirmedSince } from "@/lib/bank/intelligence/server/repositories";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";

export const dynamic = "force-dynamic";

/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — ÚNICA lectura autorizada para
 * la bandeja de Conciliación diaria: sugerencias `suggestion_scope='operational'`
 * del motor canónico (D), con evidencia de cliente/recibo/factura/pagador ya unida.
 *
 * Solo lectura. No confirma ni revierte nada — eso vive en una fase separada
 * (BANK-CANONICAL-CONFIRM-UI) que llama `confirm_bank_reconciliation_v1` /
 * `reverse_bank_reconciliation_v1` directamente, nunca desde aquí.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const limitRaw = Number(params.get("limit") ?? "20");
  const offsetRaw = Number(params.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const movementId = params.get("movementId")?.trim() || null;

  try {
    const result = await listCanonicalOperationalEvidence(auth.ctx.supabase, auth.ctx.tenantCompanyId, {
      limit,
      offset,
      movementIds: movementId ? [movementId] : undefined,
    });
    // Montevideo es UTC-3 fijo (sin DST desde 2015): 00:00 local = 03:00 UTC.
    const todayStartIso = `${todayYmdMontevideo()}T03:00:00.000Z`;
    const confirmedToday = await countOperationalConfirmedSince(auth.ctx.supabase, auth.ctx.tenantCompanyId, todayStartIso);
    return NextResponse.json({
      ok: true as const,
      data: result.items,
      meta: { total: result.total, limit, offset, confirmedToday },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        error: "No se pudieron cargar las sugerencias de conciliación.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
