/**
 * Phase 4B — SLA analytics operacional (puro, determinístico).
 */

import type {
  DEOperationalStateRow,
  OperatorAnalyticsRow,
  OperatorSlaPerformanceRow,
  OperationalSlaAnalyticsSnapshot,
  SlaBreachAgingBucket,
  SlaBreachAgingCounts,
  SlaBreachTrendPoint,
} from "@/lib/decision-engine/de-types";

const MS_PER_HOUR = 3_600_000;

const INACTIVE_STATES = new Set(["recovered", "paused"]);

function isActiveCase(row: DEOperationalStateRow): boolean {
  return !INACTIVE_STATES.has(row.machine_state);
}

function hoursSince(iso: string | null, now: Date): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, (now.getTime() - t) / MS_PER_HOUR);
}

function breachAgingBucket(hoursInBreach: number): SlaBreachAgingBucket {
  if (hoursInBreach < 24) return "<24h";
  if (hoursInBreach < 72) return "1-3d";
  if (hoursInBreach < 168) return "3-7d";
  return "+7d";
}

function emptyAging(): SlaBreachAgingCounts {
  return { "<24h": 0, "1-3d": 0, "3-7d": 0, "+7d": 0 };
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildOperationalSlaAnalytics(
  states: DEOperationalStateRow[],
  operators: OperatorAnalyticsRow[],
  operatorNames: Map<string, string>,
  now = new Date()
): OperationalSlaAnalyticsSnapshot {
  const active = states.filter(isActiveCase);
  const breached = active.filter((s) => s.breached_sla);
  const breached_total = breached.length;
  const compliance_pct =
    active.length === 0
      ? 100
      : Math.round(((active.length - breached_total) / active.length) * 1000) / 10;

  const breached_aging_buckets = emptyAging();
  for (const row of breached) {
    const hrs = hoursSince(row.transitioned_at ?? row.updated_at, now);
    const bucket = breachAgingBucket(hrs);
    breached_aging_buckets[bucket] += 1;
  }

  const trendMap = new Map<string, { breached: number; compliant: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    trendMap.set(dateKey(d), { breached: 0, compliant: 0 });
  }

  for (const row of active) {
    const key = dateKey(new Date(row.updated_at || row.transitioned_at || now));
    if (!trendMap.has(key)) continue;
    const bucket = trendMap.get(key)!;
    if (row.breached_sla) bucket.breached += 1;
    else bucket.compliant += 1;
  }

  const breach_trend: SlaBreachTrendPoint[] = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, breached: v.breached, compliant: v.compliant }));

  const operator_sla: OperatorSlaPerformanceRow[] = operators.map((op) => {
    const assigned = states.filter(
      (s) => s.assigned_user_id === op.user_id && isActiveCase(s)
    );
    const opBreaches = assigned.filter((s) => s.breached_sla).length;
    const compliance =
      assigned.length === 0
        ? 100
        : Math.round(((assigned.length - opBreaches) / assigned.length) * 1000) / 10;
    return {
      user_id: op.user_id,
      display_name: operatorNames.get(op.user_id) ?? op.display_name,
      compliance_pct: compliance,
      breaches: opBreaches,
      assigned_active: assigned.length,
    };
  });

  return {
    compliance_pct,
    breach_trend,
    operator_sla,
    breached_aging_buckets,
    breached_total,
  };
}
