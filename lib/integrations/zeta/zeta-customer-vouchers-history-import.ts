/**
 * Orquestación de importación histórica de comprobantes por cliente (Zeta read-only).
 * Cada período (mes/año) delega en `syncZetaCustomerVouchers` → corridas RAW + `proto_invoices` con upsert estable.
 */

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import {
  syncZetaCustomerVouchers,
  type SyncZetaCustomerVouchersResult,
} from "@/lib/integrations/zeta/zeta-customer-vouchers-pipeline";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";

export type HistoryMonthPeriod = { anio: number; mes: number };

function ymIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

/** Meses desde `newer` hasta `older` inclusive (orden: más reciente primero). */
export function enumerateMonthsDescending(
  newer: HistoryMonthPeriod,
  older: HistoryMonthPeriod
): HistoryMonthPeriod[] {
  const hi = ymIndex(newer.anio, newer.mes);
  const lo = ymIndex(older.anio, older.mes);
  if (hi < lo) return [];
  const out: HistoryMonthPeriod[] = [];
  let y = newer.anio;
  let mo = newer.mes;
  for (;;) {
    out.push({ anio: y, mes: mo });
    if (ymIndex(y, mo) <= lo) break;
    mo -= 1;
    if (mo < 1) {
      mo = 12;
      y -= 1;
    }
    if (out.length > 400) break;
  }
  return out;
}

export type RunCustomerVouchersHistoryImportParams = {
  supabase: OperationalSupabase;
  workspaceCompanyId: string;
  tenantId: string;
  periods: HistoryMonthPeriod[];
  pauseMsBetweenPeriods: number;
  maxPeriods: number;
  clienteCodigo?: string;
  /** Prefijo para `request_id` por período (trazas en logs). */
  requestIdPrefix: string;
  /** Si un período falla, seguir con el siguiente. */
  continueOnError: boolean;
};

export type PeriodImportOutcome = HistoryMonthPeriod &
  SyncZetaCustomerVouchersResult & { request_id: string };

export async function runCustomerVouchersHistoryImport(
  params: RunCustomerVouchersHistoryImportParams
): Promise<{
  periods_requested: number;
  periods_executed: number;
  stopped_early: boolean;
  stop_reason?: string;
  outcomes: PeriodImportOutcome[];
  aggregate: {
    processed: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    duration_ms: number;
  };
}> {
  const slice = params.periods.slice(0, Math.max(1, params.maxPeriods));
  const outcomes: PeriodImportOutcome[] = [];
  let stopped_early = slice.length < params.periods.length;
  let stop_reason: string | undefined = stopped_early
    ? `Se limitó a maxPeriods=${params.maxPeriods} (pedidos ${params.periods.length}).`
    : undefined;

  const aggregate = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    duration_ms: 0,
  };

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  for (let i = 0; i < slice.length; i++) {
    const p = slice[i]!;
    const requestId = `${params.requestIdPrefix}:${p.anio}-${String(p.mes).padStart(2, "0")}:${i}`;
    const ctx: ZetaCallContext = { requestId, tenantId: params.tenantId };
    const outcome = await syncZetaCustomerVouchers({
      supabase: params.supabase,
      workspaceCompanyId: params.workspaceCompanyId,
      ctx,
      filters: {
        mes: String(p.mes),
        anio: String(p.anio),
        clienteCodigo: params.clienteCodigo,
      },
    });
    outcomes.push({
      anio: p.anio,
      mes: p.mes,
      request_id: requestId,
      ...outcome,
    });
    aggregate.processed += outcome.processed;
    aggregate.inserted += outcome.inserted;
    aggregate.updated += outcome.updated;
    aggregate.skipped += outcome.skipped;
    aggregate.errors += outcome.errors;
    aggregate.duration_ms += outcome.duration_ms;

    if (!outcome.success && !params.continueOnError) {
      stopped_early = true;
      stop_reason = `Detenido en ${p.anio}-${p.mes}: ${outcome.error ?? outcome.message ?? "error"}`;
      break;
    }

    if (i < slice.length - 1 && params.pauseMsBetweenPeriods > 0) {
      await sleep(params.pauseMsBetweenPeriods);
    }
  }

  return {
    periods_requested: params.periods.length,
    periods_executed: outcomes.length,
    stopped_early: stopped_early || outcomes.length < params.periods.length,
    stop_reason,
    outcomes,
    aggregate,
  };
}
