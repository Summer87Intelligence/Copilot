import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { listCanonicalOperationalEvidence } from "@/lib/bank/canonical/canonical-suggestion-evidence";
import { buildIncomeWorkspaceRows, buildIncomeWorkspaceCounters } from "@/lib/bank/canonical/income-workspace";
import {
  countOperationalConfirmedSince,
  listShadowMovementsByIds,
} from "@/lib/bank/intelligence/server/repositories";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";

export const dynamic = "force-dynamic";

/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — ÚNICA lectura autorizada para
 * la bandeja de Conciliación diaria: sugerencias `suggestion_scope='operational'`
 * del motor canónico (D), con evidencia de cliente/recibo/factura/pagador ya unida.
 *
 * Solo lectura. No confirma ni revierte nada — la escritura vive en
 * `/api/copilot/bank-reconciliation/[suggestionId]/confirm|reject`, que llaman
 * `confirm_bank_reconciliation_v1` / `reject_bank_suggestion_v1` directamente,
 * nunca desde aquí.
 *
 * FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001 — agrega el modo
 * `?workspace=income&movementIds=id1,id2,...`: la pestaña Ingresos (única
 * bandeja diaria) le pasa el subconjunto "operativo" (post-corte) de sus
 * movimientos positivos ya cargados, y esta ruta devuelve, por movimiento,
 * el estado derivado + evidencia canónica vigente (si existe) + contadores.
 * Los movimientos históricos nunca tienen sugerencias `operational` (por
 * política de corte), así que el cliente ni siquiera necesita pedir evidencia
 * para ellos — evita cargar todo el historial en una sola consulta pesada.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;

  if (params.get("workspace") === "income") {
    const movementIdsRaw = params.get("movementIds") ?? "";
    const movementIds = [...new Set(movementIdsRaw.split(",").map((id) => id.trim()).filter(Boolean))];
    if (movementIds.length === 0) {
      return NextResponse.json({
        ok: true as const,
        data: [],
        meta: { counters: { pendientes: 0, conCoincidencia: 0, requiereRevision: 0, sinIdentificar: 0, conciliadosHoy: 0 } },
      });
    }
    try {
      const movements = await listShadowMovementsByIds(auth.ctx.supabase, auth.ctx.tenantCompanyId, movementIds);
      const rows = await buildIncomeWorkspaceRows(auth.ctx.supabase, auth.ctx.tenantCompanyId, movements);
      const todayStartIso = `${todayYmdMontevideo()}T03:00:00.000Z`;
      const conciliadosHoy = await countOperationalConfirmedSince(auth.ctx.supabase, auth.ctx.tenantCompanyId, todayStartIso);
      const counters = buildIncomeWorkspaceCounters(rows, conciliadosHoy);
      return NextResponse.json({ ok: true as const, data: rows, meta: { counters } });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false as const,
          error: "No se pudo cargar la bandeja de ingresos.",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }
  }

  const limitRaw = Number(params.get("limit") ?? "20");
  const offsetRaw = Number(params.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const movementId = params.get("movementId")?.trim() || null;
  // FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001: `?workspace=history` alimenta
  // la sección "Conciliaciones y decisiones recientes" de Historial — mismas sugerencias
  // operational, pero terminales (confirmed/rejected) en vez de activas.
  const statuses = params.get("workspace") === "history" ? (["confirmed", "rejected"] as const) : undefined;

  try {
    const result = await listCanonicalOperationalEvidence(auth.ctx.supabase, auth.ctx.tenantCompanyId, {
      limit,
      offset,
      movementIds: movementId ? [movementId] : undefined,
      statuses: statuses ? [...statuses] : undefined,
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
