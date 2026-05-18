import { describe, expect, it } from "vitest";

import { buildOperationalSlaAnalytics } from "@/lib/decision-engine/operational-sla-analytics";
import type { DEOperationalStateRow, OperatorAnalyticsRow } from "@/lib/decision-engine/de-types";

const NOW = new Date("2026-05-18T14:00:00.000Z");

function state(overrides: Partial<DEOperationalStateRow> & { customer_id: string }): DEOperationalStateRow {
  const { customer_id, ...rest } = overrides;
  return {
    customer_id,
    current_risk: "high",
    machine_state: "follow_up",
    legacy_follow_up_state: "monitor",
    previous_state: null,
    transitioned_at: "2026-05-10T10:00:00.000Z",
    transition_reason: null,
    breached_sla: false,
    next_follow_up_at: null,
    last_contact_at: null,
    active_promise: false,
    escalated: false,
    updated_at: "2026-05-18T08:00:00.000Z",
    assigned_user_id: "u1",
    assigned_at: null,
    assigned_by: null,
    assignment_note: null,
    ...rest,
  };
}

describe("operational-sla-analytics", () => {
  it("calcula compliance y aging buckets", () => {
    const states = [
      state({ customer_id: "c1", breached_sla: true, transitioned_at: "2026-05-18T10:00:00.000Z" }),
      state({ customer_id: "c2", breached_sla: true, transitioned_at: "2026-05-14T10:00:00.000Z" }),
      state({ customer_id: "c3" }),
    ];
    const operators: OperatorAnalyticsRow[] = [
      {
        user_id: "u1",
        display_name: "Ana",
        assigned_total: 3,
        active_critical: 1,
        sla_breaches: 2,
        completed_today: 0,
        avg_response_time_hours: null,
        avg_resolution_time_hours: null,
        overload_score: 10,
        workload_band: "elevated",
        workload_score: 10,
        critical_ratio: 0.33,
        overdue_ratio: 0.66,
      },
    ];

    const sla = buildOperationalSlaAnalytics(states, operators, new Map([["u1", "Ana"]]), NOW);

    expect(sla.breached_total).toBe(2);
    expect(sla.compliance_pct).toBeLessThan(100);
    expect(sla.breached_aging_buckets["<24h"]).toBeGreaterThanOrEqual(1);
    expect(sla.breach_trend).toHaveLength(7);
    expect(sla.operator_sla[0]?.breaches).toBe(2);
  });
});
