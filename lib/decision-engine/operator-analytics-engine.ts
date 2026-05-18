/**
 * Phase 4B — KPIs operacionales (ownership, SLA, throughput, carga).
 */

import { buildOperationalSlaAnalytics } from "@/lib/decision-engine/operational-sla-analytics";
import type {
  DECollectionAction,
  DEOperationalStateRow,
  DEFollowUpRow,
  OperatorAnalyticsInput,
  OperatorAnalyticsRow,
  OperationalAnalyticsGlobal,
  OperationalAnalyticsQueueSignals,
  OperationalAnalyticsSnapshot,
  RiskLevel,
  WorkloadBand,
} from "@/lib/decision-engine/de-types";

const MS_PER_HOUR = 3_600_000;
const INACTIVE_STATES = new Set(["recovered", "paused"]);
const CRITICAL_STATES = new Set(["critical", "escalated", "legal_review"]);

const RISK_WEIGHT: Record<RiskLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function isActiveCase(row: DEOperationalStateRow): boolean {
  return !INACTIVE_STATES.has(row.machine_state);
}

function isCriticalCase(row: DEOperationalStateRow): boolean {
  return (
    row.current_risk === "critical" ||
    CRITICAL_STATES.has(row.machine_state) ||
    row.breached_sla
  );
}

function isSameDay(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isFollowUpDueToday(scheduledFor: string, now: Date): boolean {
  const d = new Date(scheduledFor.includes("T") ? scheduledFor : `${scheduledFor}T09:00:00`);
  if (isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function hoursBetween(startIso: string | null, endIso: string): number | null {
  if (!startIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return null;
  return (end - start) / MS_PER_HOUR;
}

function avgHours(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function indexActionsByCustomer(actions: DECollectionAction[]): Map<string, DECollectionAction[]> {
  const map = new Map<string, DECollectionAction[]>();
  for (const a of actions) {
    const list = map.get(a.company_id) ?? [];
    list.push(a);
    map.set(a.company_id, list);
  }
  for (const [id, list] of map) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    map.set(id, list);
  }
  return map;
}

function classifyWorkload(
  assignedTotal: number,
  activeCritical: number,
  slaBreaches: number
): Pick<OperatorAnalyticsRow, "workload_band" | "workload_score" | "critical_ratio" | "overdue_ratio" | "overload_score"> {
  const workload_score =
    activeCritical * 5 + assignedTotal * 2 + slaBreaches * 3;
  const critical_ratio =
    assignedTotal === 0 ? 0 : Math.round((activeCritical / assignedTotal) * 100) / 100;
  const overdue_ratio =
    assignedTotal === 0 ? 0 : Math.round((slaBreaches / assignedTotal) * 100) / 100;
  const overload_score = workload_score;

  let workload_band: WorkloadBand = "normal";
  if (overload_score >= 28 || activeCritical >= 8 || critical_ratio >= 0.55) {
    workload_band = "critical";
  } else if (overload_score >= 18 || activeCritical >= 5) {
    workload_band = "overloaded";
  } else if (overload_score >= 10 || activeCritical >= 3) {
    workload_band = "elevated";
  }

  return { workload_band, workload_score, critical_ratio, overdue_ratio, overload_score };
}

function buildGlobalKpis(
  states: DEOperationalStateRow[],
  followUps: DEFollowUpRow[],
  actionsByCustomer: Map<string, DECollectionAction[]>,
  now: Date
): OperationalAnalyticsGlobal {
  const active = states.filter(isActiveCase);
  const unassigned_cases = active.filter((s) => !s.assigned_user_id).length;
  const breached_sla_cases = active.filter((s) => s.breached_sla).length;
  const critical_open = active.filter(isCriticalCase).length;
  const recovered_today = states.filter(
    (s) => s.machine_state === "recovered" && isSameDay(s.transitioned_at, now)
  ).length;
  const followups_due_today = followUps.filter(
    (f) => f.status === "pending" && isFollowUpDueToday(f.scheduled_for, now)
  ).length;
  const operational_backlog = active.length + followUps.filter((f) => f.status === "pending").length;

  const firstActionHours: (number | null)[] = [];
  const resolutionHours: (number | null)[] = [];

  for (const row of active) {
    const actions = actionsByCustomer.get(row.customer_id) ?? [];
    const anchor = row.transitioned_at ?? row.updated_at;
    const firstAfter = actions.find((a) => {
      if (!anchor) return true;
      return new Date(a.created_at).getTime() >= new Date(anchor).getTime();
    });
    if (firstAfter) {
      firstActionHours.push(hoursBetween(anchor, firstAfter.created_at));
    }

    if (row.machine_state === "recovered" && row.transitioned_at) {
      const first = actions[0];
      if (first) {
        resolutionHours.push(hoursBetween(first.created_at, row.transitioned_at));
      }
    }
  }

  return {
    active_cases: active.length,
    unassigned_cases,
    breached_sla_cases,
    avg_time_to_first_action_hours: avgHours(firstActionHours),
    avg_resolution_time_hours: avgHours(resolutionHours),
    critical_open,
    recovered_today,
    followups_due_today,
    operational_backlog,
  };
}

function buildOperatorRows(
  states: DEOperationalStateRow[],
  followUps: DEFollowUpRow[],
  actions: DECollectionAction[],
  operatorNames: Map<string, string>,
  now: Date
): OperatorAnalyticsRow[] {
  const active = states.filter(isActiveCase);
  const actionsByCustomer = indexActionsByCustomer(actions);
  const operatorIds = new Set<string>();

  for (const row of active) {
    if (row.assigned_user_id) operatorIds.add(row.assigned_user_id);
  }
  for (const id of operatorNames.keys()) {
    operatorIds.add(id);
  }

  const rows: OperatorAnalyticsRow[] = [];

  for (const userId of operatorIds) {
    const assigned = active.filter((s) => s.assigned_user_id === userId);
    const assigned_total = assigned.length;
    const active_critical = assigned.filter(isCriticalCase).length;
    const sla_breaches = assigned.filter((s) => s.breached_sla).length;

    const assignedCustomerIds = new Set(assigned.map((s) => s.customer_id));
    const completed_today = actions.filter(
      (a) =>
        assignedCustomerIds.has(a.company_id) &&
        isSameDay(a.created_at, now) &&
        (a.status === "contacted" || a.status === "promise" || a.status === "paid")
    ).length;

    const responseHours: (number | null)[] = [];
    const resolutionHours: (number | null)[] = [];

    for (const row of assigned) {
      const customerActions = actionsByCustomer.get(row.customer_id) ?? [];
      const anchor = row.assigned_at ?? row.transitioned_at ?? row.updated_at;
      const firstAfter = customerActions.find((a) => {
        if (!anchor) return true;
        return new Date(a.created_at).getTime() >= new Date(anchor).getTime();
      });
      if (firstAfter) {
        responseHours.push(hoursBetween(anchor, firstAfter.created_at));
      }
      if (row.machine_state === "recovered" && row.transitioned_at) {
        resolutionHours.push(hoursBetween(anchor, row.transitioned_at));
      }
    }

    const workload = classifyWorkload(assigned_total, active_critical, sla_breaches);

    rows.push({
      user_id: userId,
      display_name: operatorNames.get(userId) ?? "Operador",
      assigned_total,
      active_critical,
      sla_breaches,
      completed_today,
      avg_response_time_hours: avgHours(responseHours),
      avg_resolution_time_hours: avgHours(resolutionHours),
      ...workload,
    });
  }

  return rows.sort(
    (a, b) => b.overload_score - a.overload_score || b.assigned_total - a.assigned_total
  );
}

export function buildOperationalAnalyticsSnapshot(
  input: OperatorAnalyticsInput,
  now = new Date()
): OperationalAnalyticsSnapshot {
  const actionsByCustomer = indexActionsByCustomer(input.recentActions);
  const global = buildGlobalKpis(
    input.operationalStates,
    input.pendingFollowUps,
    actionsByCustomer,
    now
  );
  const operators = buildOperatorRows(
    input.operationalStates,
    input.pendingFollowUps,
    input.recentActions,
    input.operatorNames,
    now
  );
  const sla = buildOperationalSlaAnalytics(
    input.operationalStates,
    operators,
    input.operatorNames,
    now
  );

  const queue_signals: OperationalAnalyticsQueueSignals = {
    sla_breached_count: global.breached_sla_cases,
    overloaded_operators_count: operators.filter(
      (o) => o.workload_band === "overloaded" || o.workload_band === "critical"
    ).length,
    followups_due_today: global.followups_due_today,
  };

  return {
    generated_at: now.toISOString(),
    global,
    operators,
    sla,
    queue_signals,
  };
}

/** Peso de riesgo para clasificación de carga (critical > high > medium). */
export function operationalRiskWeight(level: RiskLevel): number {
  return RISK_WEIGHT[level];
}
