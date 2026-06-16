/**
 * ZETA-06: Repositorio para `zeta_pipeline_runs`.
 * Funciones para crear, actualizar y consultar runs de cron pipelines.
 * Usa service_role — la tabla no tiene RLS (nivel orchestración).
 *
 * Anti-overlap fleet (ZETA-06-03): solo considera runs con `workspace_company_id` IS NULL,
 * más expiración de runs colgados (`expireStaleFleetPipelineRuns`).
 */

import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type {
  CreatePipelineRunInput,
  FindActivePipelineRunOptions,
  UpdatePipelineRunInput,
  ZetaPipelineRunRow,
} from "@/lib/data/zeta-pipeline-run-types";

/** Ventana máxima para considerar un run como "activo" (guard anti-overlap). */
const DEFAULT_ACTIVE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 horas

/**
 * Runs `running` sin pulso desde este umbral se marcan `failed` (cron fleet).
 * 15 min: las corridas normales de saldos duran 3–5 min con heartbeats cada
 * 10 clientes (~6 s). 15 min es 3× el máximo esperado + margen holgado.
 * Reducido de 45 min para detectar corridas colgadas más rápido.
 * Override: ZETA_PIPELINE_STALE_RUNNING_MS (mínimo 60000 ms).
 */
const DEFAULT_STALE_RUNNING_MS = 15 * 60 * 1000;

function resolveStaleRunningMs(): number {
  const raw = process.env.ZETA_PIPELINE_STALE_RUNNING_MS;
  if (!raw) return DEFAULT_STALE_RUNNING_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 60_000 ? n : DEFAULT_STALE_RUNNING_MS;
}

/** Inserta un run en estado "running". Devuelve el id generado. */
export async function createPipelineRun(
  supabase: OperationalSupabase,
  input: CreatePipelineRunInput
): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    pipeline_name: input.pipeline_name,
    status: "running",
    rows_processed: 0,
    rows_updated: 0,
    rows_failed: 0,
    metadata: input.metadata ?? null,
    started_at: now,
    last_heartbeat_at: now,
  };
  if (input.workspace_company_id !== undefined) {
    row.workspace_company_id = input.workspace_company_id;
  }

  const { data, error } = await supabase
    .from("zeta_pipeline_runs")
    .insert(row)
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
 * Pulso de vida para corridas largas: evita que `expireStaleFleetPipelineRuns`
 * cierre un run legítimo mientras el cron sigue vivo.
 *
 * `progress` opcional — cuando se provee, se persiste en `metadata` junto con
 * el pulso. Incluye processed_clients, total_clients, current_client_id,
 * progress_percent y heartbeat_count para trazabilidad mid-run.
 * Nota: sobreescribe `metadata`; el caller debe incluir cron_run_id si lo necesita.
 */
export async function touchPipelineRunHeartbeat(
  supabase: OperationalSupabase,
  runId: string,
  progress?: Record<string, unknown>
): Promise<void> {
  const patch: Record<string, unknown> = {
    last_heartbeat_at: new Date().toISOString(),
  };
  if (progress !== undefined) {
    patch.metadata = progress;
  }

  const { error } = await supabase
    .from("zeta_pipeline_runs")
    .update(patch)
    .eq("id", runId)
    .eq("status", "running");

  if (error) throw new Error(`touchPipelineRunHeartbeat: ${error.message}`);
}

/**
 * Marca como `failed` los runs fleet `running` sin pulso reciente (cron colgado / crash).
 * No toca runs con `workspace_company_id` set (reservado futuro).
 */
export async function expireStaleFleetPipelineRuns(
  supabase: OperationalSupabase,
  staleMs?: number
): Promise<number> {
  const ms = staleMs ?? resolveStaleRunningMs();
  const cutoff = new Date(Date.now() - ms).toISOString();

  const { data: rows, error } = await supabase
    .from("zeta_pipeline_runs")
    .select("id, started_at, last_heartbeat_at")
    .eq("status", "running")
    .is("workspace_company_id", null)
    .limit(500);

  if (error) throw new Error(`expireStaleFleetPipelineRuns(select): ${error.message}`);

  const stale = (rows ?? []).filter((r) => {
    const row = r as {
      id: string;
      started_at: string;
      last_heartbeat_at?: string | null;
    };
    const pulse = row.last_heartbeat_at ?? row.started_at;
    return pulse < cutoff;
  });

  for (const r of stale) {
    const row = r as { id: string; started_at: string };
    const startedMs = new Date(row.started_at).getTime();
    await updatePipelineRun(supabase, row.id, {
      status: "failed",
      duration_ms: Math.max(0, Date.now() - startedMs),
      error_summary: "stale_running_timeout",
    });
  }

  return stale.length;
}

/**
 * Busca un run activo (status="running") para el pipeline dado dentro de la
 * ventana de tiempo indicada. Usado para anti-overlap entre invocaciones.
 *
 * Por defecto `workspaceScope: "fleet"` → solo filas con `workspace_company_id` IS NULL,
 * aislando de futuros runs por-tenant. Llamar `expireStaleFleetPipelineRuns` antes en crons.
 */
export async function findActivePipelineRun(
  supabase: OperationalSupabase,
  pipelineName: string,
  maxAgeMs: number = DEFAULT_ACTIVE_WINDOW_MS,
  options?: FindActivePipelineRunOptions
): Promise<ZetaPipelineRunRow | null> {
  const scope = options?.workspaceScope ?? "fleet";
  const since = new Date(Date.now() - maxAgeMs).toISOString();

  let q = supabase
    .from("zeta_pipeline_runs")
    .select("*")
    .eq("pipeline_name", pipelineName)
    .eq("status", "running")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(5);

  if (scope === "fleet") {
    q = q.is("workspace_company_id", null);
  } else {
    q = q.eq("workspace_company_id", scope.companyId);
  }

  const { data, error } = await q;

  if (error) throw new Error(`findActivePipelineRun: ${error.message}`);
  return (data?.[0] as ZetaPipelineRunRow | undefined) ?? null;
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
