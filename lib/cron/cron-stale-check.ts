/**
 * CRON-OBS-01: Detección de staleness y alerta para pipelines Zeta.
 *
 * Usa `zeta_pipeline_runs` existente — no requiere tabla nueva.
 * Diseñado para llamarse al INICIO de cada cron run:
 *   "¿El pipeline anterior tuvo éxito dentro del umbral esperado?"
 *
 * Si la última corrida exitosa supera el umbral → dispara alerta.
 * Si nunca hubo corrida exitosa → alerta crítica.
 *
 * No lanza excepciones: el cron principal no debe cortarse por un fallo de alerting.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchAlert } from "@/lib/alerts/alert-dispatcher";

const FLEET_WORKSPACE_ID = "fleet" as const;

export type StalenessInfo = {
  pipelineName: string;
  lastSuccessAt: string | null;
  ageMs: number | null;
  isStale: boolean;
  isCritical: boolean;
  neverSucceeded: boolean;
};

/**
 * Consulta la última corrida con `status = 'succeeded'` para el pipeline dado.
 * Retorna null si no hay corridas exitosas previas.
 */
export async function getLastSuccessfulRun(
  supabase: SupabaseClient,
  pipelineName: string
): Promise<{ started_at: string; finished_at: string | null } | null> {
  const { data, error } = await supabase
    .from("zeta_pipeline_runs")
    .select("started_at, finished_at")
    .eq("pipeline_name", pipelineName)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as { started_at: string; finished_at: string | null };
}

/**
 * Evalúa staleness del pipeline comparando la última corrida exitosa con ahora.
 *
 * @param thresholdMs  - Si lastSuccess > thresholdMs → stale (default: 6h)
 * @param criticalMs   - Si lastSuccess > criticalMs  → critical (default: 24h)
 */
export async function checkPipelineStaleness(
  supabase: SupabaseClient,
  pipelineName: string,
  thresholdMs = 6 * 60 * 60 * 1_000,
  criticalMs  = 24 * 60 * 60 * 1_000
): Promise<StalenessInfo> {
  let lastSuccessAt: string | null = null;
  let ageMs: number | null = null;
  let isStale = false;
  let isCritical = false;
  let neverSucceeded = false;

  try {
    const run = await getLastSuccessfulRun(supabase, pipelineName);
    if (!run) {
      neverSucceeded = true;
      isCritical = true;
      isStale = true;
    } else {
      lastSuccessAt = run.finished_at ?? run.started_at;
      ageMs = Date.now() - new Date(lastSuccessAt).getTime();
      isStale    = ageMs > thresholdMs;
      isCritical = ageMs > criticalMs;
    }
  } catch {
    // Si falla la query, no bloqueamos el cron. Retornamos info vacía.
  }

  return { pipelineName, lastSuccessAt, ageMs, isStale, isCritical, neverSucceeded };
}

/**
 * Chequea staleness y dispara alerta si corresponde.
 * Diseñado para llamarse al inicio de un cron run.
 * Never throws.
 */
export async function alertIfStale(
  supabase: SupabaseClient,
  pipelineName: string,
  options?: {
    thresholdMs?: number;
    criticalMs?: number;
    workspaceCompanyId?: string;
  }
): Promise<StalenessInfo> {
  const info = await checkPipelineStaleness(
    supabase,
    pipelineName,
    options?.thresholdMs,
    options?.criticalMs
  );

  if (!info.isStale) return info;

  const ageHours = info.ageMs != null
    ? (info.ageMs / (60 * 60 * 1_000)).toFixed(1)
    : "desconocido";

  const severity = info.isCritical ? "critical" : "warning";
  const workspaceId = options?.workspaceCompanyId ?? FLEET_WORKSPACE_ID;

  const title = info.neverSucceeded
    ? `Pipeline ${pipelineName} nunca tuvo corrida exitosa`
    : `Pipeline ${pipelineName} stale — última corrida hace ${ageHours}h`;

  const body = info.neverSucceeded
    ? `El pipeline "${pipelineName}" no registra ninguna corrida exitosa en zeta_pipeline_runs. Verificar deploy y configuración.`
    : `La última corrida exitosa de "${pipelineName}" fue hace ${ageHours} horas (umbral: ${(options?.thresholdMs ?? 6 * 60 * 60 * 1_000) / 3_600_000}h). Los datos pueden estar desactualizados.`;

  try {
    await dispatchAlert({
      event_type: "cron_pipeline_stale",
      severity,
      workspace_company_id: workspaceId,
      title,
      body,
      metadata: {
        pipeline_name: pipelineName,
        last_success_at: info.lastSuccessAt,
        age_ms: info.ageMs,
        never_succeeded: info.neverSucceeded,
      },
    });
  } catch {
    // Alerting failure nunca debe cortar el cron
  }

  return info;
}
