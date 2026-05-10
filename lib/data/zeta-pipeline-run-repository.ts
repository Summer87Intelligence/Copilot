/**
 * ZETA-06: Repositorio para `zeta_pipeline_runs`.
 * Funciones para crear, actualizar y consultar runs de cron pipelines.
 * Usa service_role — la tabla no tiene RLS (nivel orchestración global).
 */

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type {
  CreatePipelineRunInput,
  UpdatePipelineRunInput,
  ZetaPipelineRunRow,
} from "@/lib/data/zeta-pipeline-run-types";

/** Ventana máxima para considerar un run como "activo" (guard anti-overlap). */
const DEFAULT_ACTIVE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 horas

/** Inserta un run en estado "running". Devuelve el id generado. */
export async function createPipelineRun(
  supabase: OperationalSupabase,
  input: CreatePipelineRunInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("zeta_pipeline_runs")
    .insert({
      pipeline_name: input.pipeline_name,
      status: "running",
      rows_processed: 0,
      rows_updated: 0,
      rows_failed: 0,
      metadata: input.metadata ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`createPipelineRun: ${error.message}`);
  return { id: (data as { id: string }).id };
}

/** Actualiza el estado y métricas de un run al finalizar. */
export async function updatePipelineRun(
  supabase: OperationalSupabase,
  id: string,
  patch: UpdatePipelineRunInput
): Promise<void> {
  const row: Record<string, unknown> = {
    status: patch.status,
    finished_at: patch.finished_at ?? new Date().toISOString(),
  };
  if (patch.duration_ms !== undefined) row.duration_ms = patch.duration_ms;
  if (patch.rows_processed !== undefined) row.rows_processed = patch.rows_processed;
  if (patch.rows_updated !== undefined) row.rows_updated = patch.rows_updated;
  if (patch.rows_failed !== undefined) row.rows_failed = patch.rows_failed;
  if (patch.error_summary !== undefined) row.error_summary = patch.error_summary;
  if (patch.metadata !== undefined) row.metadata = patch.metadata;

  const { error } = await supabase
    .from("zeta_pipeline_runs")
    .update(row)
    .eq("id", id);

  if (error) throw new Error(`updatePipelineRun(${id}): ${error.message}`);
}

/**
 * Busca un run activo (status="running") para el pipeline dado dentro de la
 * ventana de tiempo indicada. Usado para anti-overlap entre invocaciones.
 */
export async function findActivePipelineRun(
  supabase: OperationalSupabase,
  pipelineName: string,
  maxAgeMs: number = DEFAULT_ACTIVE_WINDOW_MS
): Promise<ZetaPipelineRunRow | null> {
  const since = new Date(Date.now() - maxAgeMs).toISOString();

  const { data, error } = await supabase
    .from("zeta_pipeline_runs")
    .select("*")
    .eq("pipeline_name", pipelineName)
    .eq("status", "running")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`findActivePipelineRun: ${error.message}`);
  return (data as ZetaPipelineRunRow | null) ?? null;
}

/** Devuelve los N runs más recientes de un pipeline para el health layer. */
export async function getRecentPipelineRuns(
  supabase: OperationalSupabase,
  pipelineName: string,
  limit = 10
): Promise<ZetaPipelineRunRow[]> {
  const { data, error } = await supabase
    .from("zeta_pipeline_runs")
    .select("*")
    .eq("pipeline_name", pipelineName)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentPipelineRuns: ${error.message}`);
  return (data ?? []) as ZetaPipelineRunRow[];
}

/** Devuelve el run más reciente de cada pipeline (snapshot de estado global). */
export async function getLatestRunPerPipeline(
  supabase: OperationalSupabase,
  pipelineNames: string[]
): Promise<ZetaPipelineRunRow[]> {
  if (pipelineNames.length === 0) return [];

  const results: ZetaPipelineRunRow[] = [];
  for (const name of pipelineNames) {
    const { data, error } = await supabase
      .from("zeta_pipeline_runs")
      .select("*")
      .eq("pipeline_name", name)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) results.push(data as ZetaPipelineRunRow);
  }
  return results;
}
