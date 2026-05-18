/**
 * ZETA-06: Health layer para pipelines Zeta.
 * Funciones puras de derivación + types para el futuro Pipeline Health Dashboard.
 */

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import { getRecentPipelineRuns } from "@/lib/data/zeta-pipeline-run-repository";
import type { ZetaPipelineRunRow } from "@/lib/data/zeta-pipeline-run-types";
import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";

export type PipelineHealthStatus = "healthy" | "degraded" | "stalled" | "unknown";

export type PipelineHealthSummary = {
  pipeline_name: string;
  status: PipelineHealthStatus;
  last_run_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  last_error_summary: string | null;
  expected_interval_ms: number;
  is_overdue: boolean;
  /** Métricas del run más reciente (null si no hay runs). */
  last_run_duration_ms: number | null;
  last_run_rows_processed: number | null;
  last_run_rows_updated: number | null;
  last_run_rows_failed: number | null;
};

/** Intervalos esperados por pipeline (ms). */
export const PIPELINE_EXPECTED_INTERVALS_MS: Record<string, number> = {
  [ZETA_PIPELINE_NAMES.SALDOS]: 3 * 60 * 60 * 1_000,    // 3 h
  [ZETA_PIPELINE_NAMES.VOUCHERS]: 6 * 60 * 60 * 1_000,  // 6 h
  [ZETA_PIPELINE_NAMES.CONTACTS]: 24 * 60 * 60 * 1_000, // 24 h
  [ZETA_PIPELINE_NAMES.VENDOR_PAYMENTS]: 24 * 60 * 60 * 1_000, // diario 07:00 UTC
  [ZETA_PIPELINE_NAMES.COLLECTION_RECEIPTS]: 6 * 60 * 60 * 1_000, // cada 6 h
};

/**
 * Deriva el estado de salud de un pipeline a partir de sus runs recientes.
 *
 * Reglas:
 * - unknown   → sin runs
 * - stalled   → sin éxito en las últimas 2× el intervalo esperado
 * - degraded  → ≥2 fallos consecutivos antes del último éxito / sin éxito reciente
 * - healthy   → último run exitoso y dentro del intervalo
 */
export function derivePipelineHealth(
  pipelineName: string,
  runs: ZetaPipelineRunRow[],
  expectedIntervalMs: number,
  nowMs?: number
): PipelineHealthSummary {
  const now = nowMs ?? Date.now();

  const base: PipelineHealthSummary = {
    pipeline_name: pipelineName,
    status: "unknown",
    last_run_at: null,
    last_success_at: null,
    consecutive_failures: 0,
    last_error_summary: null,
    expected_interval_ms: expectedIntervalMs,
    is_overdue: false,
    last_run_duration_ms: null,
    last_run_rows_processed: null,
    last_run_rows_updated: null,
    last_run_rows_failed: null,
  };

  if (runs.length === 0) return base;

  // Ordena por started_at DESC (más reciente primero)
  const sorted = [...runs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  const mostRecent = sorted[0]!;
  base.last_run_at = mostRecent.started_at;
  base.last_error_summary = mostRecent.error_summary ?? null;
  base.last_run_duration_ms = mostRecent.duration_ms ?? null;
  base.last_run_rows_processed = mostRecent.rows_processed ?? null;
  base.last_run_rows_updated = mostRecent.rows_updated ?? null;
  base.last_run_rows_failed = mostRecent.rows_failed ?? null;

  // Último éxito
  const lastSuccess = sorted.find((r) => r.status === "succeeded");
  base.last_success_at = lastSuccess?.started_at ?? null;

  // Sobrecarga (overdue): sin éxito reciente dentro del intervalo esperado
  if (base.last_success_at) {
    const msSinceSuccess = now - new Date(base.last_success_at).getTime();
    base.is_overdue = msSinceSuccess > expectedIntervalMs;
  } else {
    base.is_overdue = true;
  }

  // Fallos consecutivos: contar runs fallidos más recientes antes del primer éxito
  let consecutive = 0;
  for (const run of sorted) {
    if (run.status === "succeeded") break;
    if (run.status === "failed" || run.status === "partial") consecutive++;
  }
  base.consecutive_failures = consecutive;

  // Determinar status
  const msSinceSuccess = base.last_success_at
    ? now - new Date(base.last_success_at).getTime()
    : Infinity;

  if (msSinceSuccess > 2 * expectedIntervalMs) {
    base.status = "stalled";
  } else if (consecutive >= 2) {
    base.status = "degraded";
  } else if (!base.is_overdue && sorted[0]!.status === "succeeded") {
    base.status = "healthy";
  } else if (base.is_overdue) {
    base.status = consecutive >= 1 ? "degraded" : "stalled";
  } else {
    base.status = "healthy";
  }

  return base;
}

/**
 * Devuelve el resumen de salud de todos los pipelines conocidos.
 * Usa los últimos 20 runs de cada pipeline para calcular el estado.
 */
export async function getAllPipelineHealth(
  supabase: OperationalSupabase
): Promise<PipelineHealthSummary[]> {
  const names = Object.values(ZETA_PIPELINE_NAMES);
  const now = Date.now();

  const summaries = await Promise.all(
    names.map(async (name) => {
      const runs = await getRecentPipelineRuns(supabase, name, 20);
      const expectedMs = PIPELINE_EXPECTED_INTERVALS_MS[name] ?? 24 * 60 * 60 * 1_000;
      return derivePipelineHealth(name, runs, expectedMs, now);
    })
  );

  return summaries;
}
