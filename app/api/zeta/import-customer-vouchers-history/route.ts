import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireZetaCopilotAuth } from "@/lib/integrations/zeta/zeta-api-auth";
import {
  enumerateMonthsDescending,
  runCustomerVouchersHistoryImport,
  type HistoryMonthPeriod,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-history-import";

const bodySchema = z
  .object({
    strategy: z.enum(["single_month", "month_range", "full_backfill"]),
    mes: z.coerce.number().int().min(1).max(12).optional(),
    anio: z.coerce.number().int().min(2000).max(2100).optional(),
    mesDesde: z.coerce.number().int().min(1).max(12).optional(),
    anioDesde: z.coerce.number().int().min(2000).max(2100).optional(),
    mesHasta: z.coerce.number().int().min(1).max(12).optional(),
    anioHasta: z.coerce.number().int().min(2000).max(2100).optional(),
    /** Límite inferior del backfill completo (inclusive). */
    earliestAnio: z.coerce.number().int().min(1990).max(2100).optional(),
    earliestMes: z.coerce.number().int().min(1).max(12).optional(),
    /** Tope del backfill (inclusive); default = mes calendario actual. */
    hastaAnio: z.coerce.number().int().min(2000).max(2100).optional(),
    hastaMes: z.coerce.number().int().min(1).max(12).optional(),
    maxPeriods: z.coerce.number().int().min(1).max(240).optional(),
    pauseMsBetweenPeriods: z.coerce.number().int().min(0).max(30_000).optional(),
    clienteCodigo: z.string().trim().max(20).optional(),
    continueOnError: z.boolean().optional(),
  })
  .strict();

function currentMonthPeriod(): HistoryMonthPeriod {
  const d = new Date();
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}

function resolvePeriods(d: z.infer<typeof bodySchema>): { periods: HistoryMonthPeriod[]; error?: string } {
  if (d.strategy === "single_month") {
    if (d.mes == null || d.anio == null) {
      return { periods: [], error: "single_month requiere mes y anio." };
    }
    return { periods: [{ anio: d.anio, mes: d.mes }] };
  }

  if (d.strategy === "month_range") {
    const md = d.mesDesde;
    const ad = d.anioDesde;
    const mh = d.mesHasta;
    const ah = d.anioHasta;
    if (md == null || ad == null || mh == null || ah == null) {
      return { periods: [], error: "month_range requiere mesDesde, anioDesde, mesHasta y anioHasta." };
    }
    const older = { anio: ad, mes: md };
    const newer = { anio: ah, mes: mh };
    const idxOld = older.anio * 12 + (older.mes - 1);
    const idxNew = newer.anio * 12 + (newer.mes - 1);
    if (idxNew < idxOld) {
      return { periods: [], error: "Rango inválido: mesHasta/anioHasta debe ser >= mesDesde/anioDesde." };
    }
    return { periods: enumerateMonthsDescending(newer, older) };
  }

  const now = currentMonthPeriod();
  const newer: HistoryMonthPeriod = {
    anio: d.hastaAnio ?? now.anio,
    mes: d.hastaMes ?? now.mes,
  };
  const older: HistoryMonthPeriod = {
    anio: d.earliestAnio ?? 2000,
    mes: d.earliestMes ?? 1,
  };
  const idxOld = older.anio * 12 + (older.mes - 1);
  const idxNew = newer.anio * 12 + (newer.mes - 1);
  if (idxNew < idxOld) {
    return { periods: [], error: "full_backfill: hasta debe ser >= earliest." };
  }
  return { periods: enumerateMonthsDescending(newer, older) };
}

/**
 * POST /api/zeta/import-customer-vouchers-history
 * Solo lectura en Zeta por período; persiste localmente vía `syncZetaCustomerVouchers` (una corrida Zeta por mes).
 */
export async function POST(request: NextRequest) {
  const pv = await parseAndValidateJsonBody(request, bodySchema);
  if (!pv.ok) return pv.response;

  const auth = await requireZetaCopilotAuth(request, pv.data as Record<string, unknown>);
  if (!auth.ok) return auth.response;

  const tenantId = auth.ctx.tenantCompanyId?.trim();
  if (!tenantId) {
    return NextResponse.json(
      { success: false as const, error: "Sin workspace válido." },
      { status: 403 }
    );
  }

  const d = pv.data;
  const { periods, error } = resolvePeriods(d);
  if (error) {
    return NextResponse.json({ success: false as const, error, error_code: "validation" }, { status: 400 });
  }
  if (periods.length === 0) {
    return NextResponse.json(
      { success: false as const, error: "No hay períodos para importar.", error_code: "validation" },
      { status: 400 }
    );
  }

  const maxPeriods = d.maxPeriods ?? 12;
  const pauseMs = d.pauseMsBetweenPeriods ?? 500;
  const continueOnError = d.continueOnError ?? true;
  const requestIdPrefix =
    globalThis.crypto?.randomUUID?.() ?? `import-vouchers-history-${Date.now()}`;

  const summary = await runCustomerVouchersHistoryImport({
    supabase: auth.ctx.supabase,
    workspaceCompanyId: tenantId,
    tenantId,
    periods,
    pauseMsBetweenPeriods: pauseMs,
    maxPeriods,
    clienteCodigo: d.clienteCodigo,
    requestIdPrefix,
    continueOnError,
  });

  const allOk = summary.outcomes.length > 0 && summary.outcomes.every((o) => o.success);
  const status = allOk ? 200 : continueOnError ? 200 : 502;

  return NextResponse.json(
    {
      success: allOk,
      partial: !allOk && continueOnError,
      strategy: d.strategy,
      periods_requested: summary.periods_requested,
      periods_executed: summary.periods_executed,
      stopped_early: summary.stopped_early,
      stop_reason: summary.stop_reason,
      aggregate: summary.aggregate,
      outcomes: summary.outcomes.map((o) => ({
        anio: o.anio,
        mes: o.mes,
        request_id: o.request_id,
        success: o.success,
        processed: o.processed,
        inserted: o.inserted,
        updated: o.updated,
        skipped: o.skipped,
        errors: o.errors,
        duration_ms: o.duration_ms,
        error_code: o.error_code,
        error: o.error ?? o.message,
      })),
    },
    { status }
  );
}
