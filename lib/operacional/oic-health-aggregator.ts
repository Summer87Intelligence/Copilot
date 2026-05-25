import type { SupabaseClient } from "@supabase/supabase-js";
import { runFinancialHealthChecks } from "@/lib/copilot-financial-health";
import type {
  OicHealthDashboardData,
  OicHealthDimension,
  OicSeverity,
} from "@/lib/operacional/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreToDimensionSeverity(score: number): OicSeverity {
  if (score >= 80) return "ok";
  if (score >= 50) return "warning";
  if (score >= 20) return "degraded";
  return "critical";
}

function overallSeverity(score: number): OicSeverity {
  if (score >= 80) return "ok";
  if (score >= 60) return "warning";
  if (score >= 35) return "degraded";
  return "critical";
}

// ── Dimension: pipeline_health (30%) ─────────────────────────────────────────

async function computePipelineHealthDimension(
  supabase: SupabaseClient,
  since: Date
): Promise<{ dimension: OicHealthDimension; lastSuccessAt: string | null }> {
  const { data } = await supabase
    .from("zeta_pipeline_runs")
    .select("status, started_at, finished_at")
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: false })
    .limit(50);

  const rows = data ?? [];
  const total = rows.length;
  const succeeded = rows.filter((r) => r.status === "succeeded").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  let score = 100;
  if (total === 0) {
    score = 40; // No recent runs → degraded
  } else {
    const failRate = failed / total;
    score = Math.max(0, Math.round(100 - failRate * 100 - (total === 0 ? 30 : 0)));
  }

  const lastSuccess = rows.find((r) => r.status === "succeeded");
  const lastSuccessAt = lastSuccess?.started_at ?? null;

  return {
    dimension: {
      key: "pipeline_health",
      label: "Salud de Pipelines",
      score,
      weight: 0.3,
      severity: scoreToDimensionSeverity(score),
      detail:
        total === 0
          ? "Sin ejecuciones recientes"
          : `${succeeded}/${total} corridas exitosas (últimas 24h)`,
    },
    lastSuccessAt,
  };
}

// ── Dimension: sync_freshness (25%) ──────────────────────────────────────────

async function computeSyncFreshnessDimension(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<{ dimension: OicHealthDimension; lastSyncAt: string | null }> {
  const { data } = await supabase
    .from("zeta_sync_runs")
    .select("started_at, status")
    .eq("company_id", workspaceCompanyId)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSyncAt = data?.started_at ?? null;
  let score = 100;
  let detail = "Sin historial de sync";

  if (lastSyncAt) {
    const ageHours =
      (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
    if (ageHours <= 2) {
      score = 100;
      detail = `Último sync hace ${Math.round(ageHours * 60)} min`;
    } else if (ageHours <= 6) {
      score = 80;
      detail = `Último sync hace ${Math.round(ageHours)} h`;
    } else if (ageHours <= 24) {
      score = 55;
      detail = `Último sync hace ${Math.round(ageHours)} h`;
    } else {
      score = 20;
      detail = `Último sync hace ${Math.round(ageHours / 24)} días`;
    }
  } else {
    score = 0;
  }

  return {
    dimension: {
      key: "sync_freshness",
      label: "Frescura de Sync",
      score,
      weight: 0.25,
      severity: scoreToDimensionSeverity(score),
      detail,
    },
    lastSyncAt,
  };
}

// ── Dimension: integrity (25%) ────────────────────────────────────────────────

async function computeIntegrityDimension(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<{ dimension: OicHealthDimension; openViolations: number }> {
  const { data } = await supabase
    .from("zeta_integrity_violations")
    .select("severity")
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("status", "open");

  const rows = data ?? [];
  const critical = rows.filter((r) => r.severity === "critical").length;
  const warning = rows.filter((r) => r.severity === "warning").length;
  const openViolations = rows.length;

  let score = 100;
  if (critical > 0) {
    score = Math.max(0, 40 - critical * 10);
  } else if (warning > 0) {
    score = Math.max(40, 90 - warning * 5);
  }

  return {
    dimension: {
      key: "integrity",
      label: "Integridad de Datos",
      score,
      weight: 0.25,
      severity: scoreToDimensionSeverity(score),
      detail:
        openViolations === 0
          ? "Sin violaciones abiertas"
          : `${critical} críticas, ${warning} warnings`,
    },
    openViolations,
  };
}

// ── Dimension: queue_health (10%) ─────────────────────────────────────────────

async function computeQueueHealthDimension(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<{ dimension: OicHealthDimension; pendingResyncJobs: number }> {
  const { data } = await supabase
    .from("zeta_resync_jobs")
    .select("id, status")
    .eq("workspace_company_id", workspaceCompanyId)
    .in("status", ["pending", "running"]);

  const pending = (data ?? []).length;
  const score = pending === 0 ? 100 : pending <= 3 ? 75 : pending <= 10 ? 50 : 20;

  return {
    dimension: {
      key: "queue_health",
      label: "Cola de Re-sync",
      score,
      weight: 0.1,
      severity: scoreToDimensionSeverity(score),
      detail:
        pending === 0 ? "Cola vacía" : `${pending} jobs pendientes/activos`,
    },
    pendingResyncJobs: pending,
  };
}

// ── Dimension: api_health (10%) ───────────────────────────────────────────────

async function computeApiHealthDimension(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  since: Date
): Promise<OicHealthDimension> {
  const { data } = await supabase
    .from("zeta_sync_runs")
    .select("status")
    .eq("company_id", workspaceCompanyId)
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: false })
    .limit(20);

  const rows = data ?? [];
  const total = rows.length;
  const failed = rows.filter((r) => r.status === "failed").length;

  let score = 100;
  if (total > 0) {
    score = Math.round(((total - failed) / total) * 100);
  }

  return {
    key: "api_health",
    label: "API Zeta",
    score,
    weight: 0.1,
    severity: scoreToDimensionSeverity(score),
    detail:
      total === 0
        ? "Sin llamadas recientes"
        : `${total - failed}/${total} llamadas exitosas (últimas 24h)`,
  };
}

// ── Main aggregator ───────────────────────────────────────────────────────────

export async function computeOicHealthDashboard(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<OicHealthDashboardData> {
  const computedAt = new Date().toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [pipelineResult, freshnessResult, integrityResult, queueResult, apiDim] =
    await Promise.all([
      computePipelineHealthDimension(supabase, since24h),
      computeSyncFreshnessDimension(supabase, workspaceCompanyId),
      computeIntegrityDimension(supabase, workspaceCompanyId),
      computeQueueHealthDimension(supabase, workspaceCompanyId),
      computeApiHealthDimension(supabase, workspaceCompanyId, since24h),
    ]);

  const dimensions: OicHealthDimension[] = [
    pipelineResult.dimension,
    freshnessResult.dimension,
    integrityResult.dimension,
    queueResult.dimension,
    apiDim,
  ];

  const overallScore = Math.round(
    dimensions.reduce((acc, d) => acc + d.score * d.weight, 0)
  );

  return {
    workspaceCompanyId,
    computedAt,
    overallScore,
    severity: overallSeverity(overallScore),
    dimensions,
    lastPipelineRunAt: pipelineResult.lastSuccessAt,
    lastSyncAt: freshnessResult.lastSyncAt,
    openViolations: integrityResult.openViolations,
    pendingResyncJobs: queueResult.pendingResyncJobs,
  };
}

// Re-export for consumers that want the financial health checks alongside
export { runFinancialHealthChecks };
