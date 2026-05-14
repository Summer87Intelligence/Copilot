/**
 * OPS-06-10 — Telemetría operacional
 *
 * Ring buffer por workspace de métricas de rebuild, governance y snapshot.
 * Usado por el health API y por logs estructurados.
 * No usa servicios externos. Solo estado en-memoria del proceso.
 */

const MAX_METRICS_PER_WORKSPACE = 50;

export type WorkflowRebuildPhase = "full" | "lightweight";

export type WorkflowRebuildMetric = {
  workspaceCompanyId: string;
  durationMs: number;
  workflowCount: number;
  emittedEventCount: number;
  automationCount: number;
  degraded: boolean;
  rebuildReason: string;
  phase: WorkflowRebuildPhase;
  timestamp: string;
};

export type RebuildHealthSummary = {
  workspaceCompanyId: string;
  rebuildCount: number;
  avgDurationMs: number;
  lastDurationMs: number;
  degradedCount: number;
  lastWorkflowCount: number;
  lastAutomationCount: number;
  lastTimestamp: string | null;
};

const metricsBuffer = new Map<string, WorkflowRebuildMetric[]>();

export function recordRebuildMetric(metric: WorkflowRebuildMetric): void {
  const existing = metricsBuffer.get(metric.workspaceCompanyId) ?? [];
  const next = [...existing, metric];
  metricsBuffer.set(
    metric.workspaceCompanyId,
    next.length > MAX_METRICS_PER_WORKSPACE
      ? next.slice(next.length - MAX_METRICS_PER_WORKSPACE)
      : next
  );
}

export function getWorkspaceRebuildMetrics(
  workspaceCompanyId: string
): WorkflowRebuildMetric[] {
  return metricsBuffer.get(workspaceCompanyId) ?? [];
}

export function getRebuildHealthSummary(
  workspaceCompanyId: string
): RebuildHealthSummary {
  const metrics = metricsBuffer.get(workspaceCompanyId) ?? [];
  if (metrics.length === 0) {
    return {
      workspaceCompanyId,
      rebuildCount: 0,
      avgDurationMs: 0,
      lastDurationMs: 0,
      degradedCount: 0,
      lastWorkflowCount: 0,
      lastAutomationCount: 0,
      lastTimestamp: null,
    };
  }
  const last = metrics[metrics.length - 1]!;
  const avgDurationMs = Math.round(
    metrics.reduce((sum, m) => sum + m.durationMs, 0) / metrics.length
  );
  return {
    workspaceCompanyId,
    rebuildCount: metrics.length,
    avgDurationMs,
    lastDurationMs: last.durationMs,
    degradedCount: metrics.filter((m) => m.degraded).length,
    lastWorkflowCount: last.workflowCount,
    lastAutomationCount: last.automationCount,
    lastTimestamp: last.timestamp,
  };
}

export function getAllTrackedWorkspaces(): string[] {
  return [...metricsBuffer.keys()];
}

export function clearTelemetryForTests(): void {
  metricsBuffer.clear();
}

/** Mide el tiempo de una operación async y registra la métrica. */
export async function withRebuildTiming<T>(
  workspaceCompanyId: string,
  phase: WorkflowRebuildPhase,
  rebuildReason: string,
  operation: () => Promise<T & {
    workflowCount?: number;
    emittedEventCount?: number;
    automationCount?: number;
    degraded?: boolean;
  }>
): Promise<T> {
  const start = Date.now();
  const result = await operation();
  const durationMs = Date.now() - start;

  recordRebuildMetric({
    workspaceCompanyId,
    durationMs,
    workflowCount: result.workflowCount ?? 0,
    emittedEventCount: result.emittedEventCount ?? 0,
    automationCount: result.automationCount ?? 0,
    degraded: result.degraded ?? false,
    rebuildReason,
    phase,
    timestamp: new Date().toISOString(),
  });

  return result;
}
