/**
 * Phase 5D — Operator Effectiveness Engine.
 * Proxy: DEOperationalStateRow × OperatorAnalyticsRow (analytics.operators).
 * Puro: sin imports de DB, sin side effects.
 */

import type {
  DEOperationalStateRow,
  OperationalAnalyticsSnapshot,
  OperatorAnalyticsRow,
  OperatorSlaPerformanceRow,
} from "@/lib/decision-engine/de-types";
import type {
  LearningOutcome,
  OperatorEffectivenessRow,
  OperatorEffectivenessSnapshot,
  StrategicLearningContext,
} from "./learning-types";

const MIN_OUTCOMES_FOR_PRIMARY = 10;

// ---------------------------------------------------------------------------
// Proxy path
// ---------------------------------------------------------------------------

function computeProxyRows(
  states: DEOperationalStateRow[],
  analytics: OperationalAnalyticsSnapshot
): OperatorEffectivenessRow[] {
  // Group states by assigned_user_id
  const byOperator = new Map<string, DEOperationalStateRow[]>();
  for (const s of states) {
    if (!s.assigned_user_id) continue;
    const arr = byOperator.get(s.assigned_user_id) ?? [];
    arr.push(s);
    byOperator.set(s.assigned_user_id, arr);
  }

  const analyticsById = new Map<string, OperatorAnalyticsRow>(
    analytics.operators.map((o) => [o.user_id, o])
  );
  const slaById = new Map<string, OperatorSlaPerformanceRow>(
    analytics.sla.operator_sla.map((o) => [o.user_id, o])
  );

  const rows: OperatorEffectivenessRow[] = [];
  for (const [userId, operatorStates] of byOperator) {
    const analyticsRow = analyticsById.get(userId);
    const slaRow = slaById.get(userId);

    const total = operatorStates.length;
    const recovered = operatorStates.filter((s) => s.machine_state === "recovered").length;
    const recoveryRate = total > 0 ? Math.round((recovered / total) * 100) : 0;

    rows.push({
      user_id:              userId,
      display_name:         analyticsRow?.display_name ?? userId,
      total_cases_handled:  total,
      recovered_cases:      recovered,
      recovery_rate_pct:    recoveryRate,
      avg_response_hours:   analyticsRow?.avg_response_time_hours ?? null,
      sla_compliance_pct:   slaRow?.compliance_pct ?? 100,
      promise_kept_rate_pct: 0, // unavailable from proxy
      sample_size:          total,
      insight:              buildOperatorInsight(
        analyticsRow?.display_name ?? userId,
        recoveryRate,
        slaRow?.compliance_pct ?? null
      ),
    });
  }

  return rows.sort((a, b) => b.recovery_rate_pct - a.recovery_rate_pct);
}

// ---------------------------------------------------------------------------
// Primary path (formal outcomes)
// ---------------------------------------------------------------------------

function computeRowsFromOutcomes(
  outcomes: LearningOutcome[],
  states: DEOperationalStateRow[],
  analytics: OperationalAnalyticsSnapshot
): OperatorEffectivenessRow[] {
  // Map customer_id → assigned_user_id
  const userByCustomer = new Map<string, string>(
    states
      .filter((s) => s.assigned_user_id !== null)
      .map((s) => [s.customer_id, s.assigned_user_id as string])
  );

  // Group outcomes by operator
  const byOperator = new Map<string, LearningOutcome[]>();
  for (const o of outcomes) {
    const userId = userByCustomer.get(o.customer_id);
    if (!userId) continue;
    const arr = byOperator.get(userId) ?? [];
    arr.push(o);
    byOperator.set(userId, arr);
  }

  const analyticsById = new Map<string, OperatorAnalyticsRow>(
    analytics.operators.map((o) => [o.user_id, o])
  );
  const slaById = new Map<string, OperatorSlaPerformanceRow>(
    analytics.sla.operator_sla.map((o) => [o.user_id, o])
  );

  const rows: OperatorEffectivenessRow[] = [];
  for (const [userId, operatorOutcomes] of byOperator) {
    const analyticsRow = analyticsById.get(userId);
    const slaRow = slaById.get(userId);

    const total        = operatorOutcomes.length;
    const recovered    = operatorOutcomes.filter((o) => o.outcome_type === "recovered").length;
    const promiseKept  = operatorOutcomes.filter((o) => o.outcome_type === "promise_kept").length;
    const recoveryRate = total > 0 ? Math.round((recovered / total) * 100) : 0;
    const promiseRate  = total > 0 ? Math.round((promiseKept / total) * 100) : 0;
    const displayName  = analyticsRow?.display_name ?? userId;

    rows.push({
      user_id:               userId,
      display_name:          displayName,
      total_cases_handled:   total,
      recovered_cases:       recovered,
      recovery_rate_pct:     recoveryRate,
      avg_response_hours:    analyticsRow?.avg_response_time_hours ?? null,
      sla_compliance_pct:    slaRow?.compliance_pct ?? 100,
      promise_kept_rate_pct: promiseRate,
      sample_size:           total,
      insight:               buildOperatorInsight(displayName, recoveryRate, slaRow?.compliance_pct ?? null),
    });
  }

  return rows.sort((a, b) => b.recovery_rate_pct - a.recovery_rate_pct);
}

function buildOperatorInsight(
  name: string,
  recoveryRate: number,
  slaPct: number | null
): string {
  const parts: string[] = [];
  if (recoveryRate >= 70) parts.push(`Alta tasa de recuperación (${recoveryRate}%).`);
  else if (recoveryRate < 30) parts.push(`Baja tasa de recuperación (${recoveryRate}%).`);
  if (slaPct !== null && slaPct < 80) parts.push(`SLA bajo: ${Math.round(slaPct)}%.`);
  return parts.length > 0 ? parts.join(" ") : null as unknown as string;
}

function buildInsight(rows: OperatorEffectivenessRow[]): string {
  if (rows.length === 0) return "Sin operadores con casos asignados para analizar.";
  const top = rows[0]!;
  if (rows.length === 1) {
    return `${top.display_name} gestiona ${top.total_cases_handled} caso(s) con ${top.recovery_rate_pct}% de recuperación.`;
  }
  return (
    `${top.display_name} lidera con ${top.recovery_rate_pct}% de recuperación. ` +
    `${rows.length} operadores analizados.`
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function computeOperatorEffectiveness(
  context: StrategicLearningContext
): OperatorEffectivenessSnapshot {
  const { bundle, existingOutcomes, analytics } = context;
  const nowIso = context.loadedAt;

  if (!analytics) {
    return {
      generated_at:            nowIso,
      total_outcomes_analyzed: 0,
      by_operator:             [],
      top_operator_id:         null,
      insight:                 "Analytics operacional no disponible.",
      data_source:             "insufficient",
    };
  }

  let rows: OperatorEffectivenessRow[];
  let dataSource: OperatorEffectivenessSnapshot["data_source"];

  if (existingOutcomes.length >= MIN_OUTCOMES_FOR_PRIMARY) {
    rows = computeRowsFromOutcomes(existingOutcomes, bundle.operationalStates, analytics);
    dataSource = "outcomes";
  } else {
    rows = computeProxyRows(bundle.operationalStates, analytics);
    dataSource = rows.length > 0 ? "proxy" : "insufficient";
  }

  return {
    generated_at:            nowIso,
    total_outcomes_analyzed: existingOutcomes.length > 0 ? existingOutcomes.length : bundle.operationalStates.length,
    by_operator:             rows,
    top_operator_id:         rows[0]?.user_id ?? null,
    insight:                 buildInsight(rows),
    data_source:             dataSource,
  };
}
