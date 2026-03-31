import {
  buildAlertsFromSnapshot,
  buildMetricsFromSnapshot,
  buildRecommendedActionsFromSnapshot,
  dashboardScenarios,
  type DashboardScenarioName,
  type DashboardSnapshot,
} from "@/lib/dashboard-data";
import { getEstimatedImpact } from "@/lib/dashboard-impact";
import { getExecutiveInsight } from "@/lib/dashboard-insights";
import { getPriorityOfTheDay } from "@/lib/dashboard-priority";
import { getScenarioMeta } from "@/lib/dashboard-scenario-meta";
import { getTodayActions } from "@/lib/dashboard-today-actions";
import { generateCopilotInsights } from "@/lib/copilot-engine";
import { generateCopilotExecutiveSummary } from "@/lib/copilot-summary";
import type { SnapshotTrends } from "@/lib/dashboard-trends";
import { getSnapshotTrends } from "@/lib/dashboard-trends";
import type { Metric } from "@/types/dashboard";
import type { CopilotInsightRecord } from "@/types/copilot-insight-record";
import type { DashboardSnapshotRecord } from "@/types/dashboard-source";
import { isZetaSimulationActive, getCopilotMode } from "@/lib/copilot-mode";
import {
  sampleZetaBatch,
  sampleZetaBatchHighRisk,
} from "@/mocks/zeta-sample-data";
import { buildDashboardSnapshotFromZetaBatch } from "@/services/zeta-sync-orchestrator";
import {
  type DashboardSnapshotScenario,
  getDashboardSnapshotFromDB as getDashboardSnapshotFromSupabase,
  getLatestSnapshot as getLatestSnapshotFromSupabase,
  getDashboardSnapshotRecordByScenario as getDashboardSnapshotRecordFromSupabase,
  getPreviousDashboardSnapshotFromDB as getPreviousDashboardSnapshotFromSupabase,
} from "@/services/dashboard-source";

function coerceToStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export type { DashboardScenarioName } from "@/lib/dashboard-data";

const DEFAULT_SCENARIO: DashboardScenarioName = "risk";

const snapshotInflight = new Map<string, Promise<DashboardSnapshot>>();

/**
 * Snapshot derivado del mock Zeta según `NEXT_PUBLIC_COPILOT_MODE`.
 * Mismo resultado para cualquier escenario UI (risk/stable/growth): el selector
 * no altera el lote simulado hasta que existan datasets por escenario.
 */
function getZetaSimDashboardSnapshot(): DashboardSnapshot {
  const mode = getCopilotMode();
  if (mode === "zeta-sim-high-risk") {
    return buildDashboardSnapshotFromZetaBatch(sampleZetaBatchHighRisk)
      .dashboardSnapshot;
  }
  return buildDashboardSnapshotFromZetaBatch(sampleZetaBatch).dashboardSnapshot;
}

async function getDashboardSnapshotForScenario(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshot> {
  if (isZetaSimulationActive()) {
    return getZetaSimDashboardSnapshot();
  }
  const key = scenario ?? DEFAULT_SCENARIO;
  let pending = snapshotInflight.get(key);
  if (!pending) {
    pending = getDashboardSnapshotFromSupabase(scenario);
    snapshotInflight.set(key, pending);
    pending.finally(() => {
      snapshotInflight.delete(key);
    });
  }
  return pending;
}

/** Igual que antes: último snapshot por empresa y escenario; en simulación Zeta, `id` null. */
export async function getDashboardSnapshotRecordByScenario(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshotRecord> {
  if (isZetaSimulationActive()) {
    return { id: null, snapshot: getZetaSimDashboardSnapshot() };
  }
  return getDashboardSnapshotRecordFromSupabase(scenario);
}

/** En simulación Zeta no hay serie histórica en DB → sin tendencias período a período. */
export async function getPreviousDashboardSnapshotFromDB(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshot | null> {
  if (isZetaSimulationActive()) {
    return null;
  }
  return getPreviousDashboardSnapshotFromSupabase(scenario);
}

export async function getDashboardSnapshotFromDB(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshot> {
  return getDashboardSnapshotForScenario(scenario);
}

export function getDashboardSnapshotSyncFallback(
  scenario?: DashboardScenarioName
): DashboardSnapshot {
  const key = scenario ?? DEFAULT_SCENARIO;
  return dashboardScenarios[key];
}

export type DashboardViewModel = ReturnType<typeof buildDashboardViewFromSnapshot>;

export function buildDashboardViewFromSnapshot(
  currentSnapshot: DashboardSnapshot,
  previousSnapshot?: DashboardSnapshot | null,
  previousInsights?: CopilotInsightRecord[] | null
) {
  const copilotInsights = generateCopilotInsights(
    currentSnapshot,
    previousSnapshot ?? undefined,
    previousInsights ?? []
  );
  const trends: SnapshotTrends | null =
    previousSnapshot != null
      ? getSnapshotTrends(currentSnapshot, previousSnapshot)
      : null;

  return {
    metrics: buildMetricsFromSnapshot(currentSnapshot),
    alerts: buildAlertsFromSnapshot(currentSnapshot),
    recommendedActions: buildRecommendedActionsFromSnapshot(currentSnapshot),
    executiveInsight: getExecutiveInsight(currentSnapshot),
    priorityOfTheDay: getPriorityOfTheDay(currentSnapshot),
    todayActions: coerceToStringArray(getTodayActions(currentSnapshot)),
    estimatedImpact: getEstimatedImpact(currentSnapshot),
    copilotInsights,
    copilotExecutiveSummary: generateCopilotExecutiveSummary(copilotInsights),
    trends,
  };
}

export async function getDashboardMetrics(
  scenario?: DashboardSnapshotScenario
): Promise<Metric[]> {
  const s = await getDashboardSnapshotForScenario(scenario);
  return buildMetricsFromSnapshot(s);
}

export async function getDashboardAlerts(
  scenario?: DashboardSnapshotScenario
): Promise<string[]> {
  const s = await getDashboardSnapshotForScenario(scenario);
  return buildAlertsFromSnapshot(s);
}

export async function getDashboardRecommendedActions(
  scenario?: DashboardSnapshotScenario
): Promise<string[]> {
  const s = await getDashboardSnapshotForScenario(scenario);
  return buildRecommendedActionsFromSnapshot(s);
}

export async function getDashboardExecutiveInsight(
  scenario?: DashboardSnapshotScenario
): Promise<string> {
  const s = await getDashboardSnapshotForScenario(scenario);
  return getExecutiveInsight(s);
}

export async function getDashboardPriorityOfTheDay(
  scenario?: DashboardSnapshotScenario
) {
  const s = await getDashboardSnapshotForScenario(scenario);
  return getPriorityOfTheDay(s);
}

export async function getDashboardTodayActions(
  scenario?: DashboardSnapshotScenario
): Promise<string[]> {
  const s = await getDashboardSnapshotForScenario(scenario);
  return coerceToStringArray(getTodayActions(s));
}

export function getDashboardScenarioMeta(scenario?: DashboardScenarioName) {
  const key = scenario ?? DEFAULT_SCENARIO;
  return getScenarioMeta(key);
}

export async function getDashboardEstimatedImpact(
  scenario?: DashboardSnapshotScenario
) {
  const s = await getDashboardSnapshotForScenario(scenario);
  return getEstimatedImpact(s);
}

export async function getDashboardSnapshotByScenario(
  scenario?: DashboardSnapshotScenario
): Promise<DashboardSnapshot> {
  return getDashboardSnapshotForScenario(scenario);
}

/**
 * Último snapshot persistido por empresa (sin filtro de escenario) para alimentar
 * el dashboard principal en modo live.
 */
export async function getLatestSnapshot(companyId: string) {
  if (isZetaSimulationActive()) {
    return { id: null, snapshot: getZetaSimDashboardSnapshot() };
  }
  return getLatestSnapshotFromSupabase(companyId);
}
