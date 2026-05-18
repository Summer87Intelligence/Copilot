import { describe, expect, it } from "vitest";

import {
  buildOperationalAnalyticsSnapshot,
  operationalRiskWeight,
} from "@/lib/decision-engine/operator-analytics-engine";
import type {
  DECollectionAction,
  DEOperationalStateRow,
  DEFollowUpRow,
  OperatorAnalyticsInput,
} from "@/lib/decision-engine/de-types";

const NOW = new Date("2026-05-18T14:00:00.000Z");

function state(overrides: Partial<DEOperationalStateRow> & { customer_id: string }): DEOperationalStateRow {
  const { customer_id, ...rest } = overrides;
  return {
    customer_id,
    current_risk: "high",
    machine_state: "follow_up",
    legacy_follow_up_state: "monitor",
    previous_state: null,
    transitioned_at: "2026-05-17T10:00:00.000Z",
    transition_reason: null,
    breached_sla: false,
    next_follow_up_at: null,
    last_contact_at: null,
    active_promise: false,
    escalated: false,
    updated_at: "2026-05-18T08:00:00.000Z",
    assigned_user_id: null,
    assigned_at: null,
    assigned_by: null,
    assignment_note: null,
    ...rest,
  };
}

function input(partial: Partial<OperatorAnalyticsInput> = {}): OperatorAnalyticsInput {
  return {
    operationalStates: [],
    pendingFollowUps: [],
    recentActions: [],
    operatorNames: new Map([["u1", "Ana"], ["u2", "Luis"]]),
    loadedAt: NOW.toISOString(),
    ...partial,
  };
}

describe("operator-analytics-engine", () => {
  it("calcula KPIs globales y señales de cola", () => {
    const snapshot = buildOperationalAnalyticsSnapshot(
      input({
        operationalStates: [
          state({ customer_id: "c1", assigned_user_id: "u1" }),
          state({
            customer_id: "c2",
            machine_state: "critical",
            current_risk: "critical",
            breached_sla: true,
          }),
          state({ customer_id: "c3", machine_state: "recovered", transitioned_at: NOW.toISOString() }),
        ],
        pendingFollowUps: [
          {
            id: "fu1",
            customer_id: "c1",
            status: "pending",
            scheduled_for: "2026-05-18T09:00:00.000Z",
            reason: "Llamar",
            source_action_id: null,
            priority: "high",
          },
        ],
      }),
      NOW
    );

    expect(snapshot.global.active_cases).toBe(2);
    expect(snapshot.global.unassigned_cases).toBe(1);
    expect(snapshot.global.breached_sla_cases).toBe(1);
    expect(snapshot.global.recovered_today).toBe(1);
    expect(snapshot.global.followups_due_today).toBe(1);
    expect(snapshot.queue_signals.sla_breached_count).toBe(1);
  });

  it("agrega métricas por operador y workload band", () => {
    const states = Array.from({ length: 6 }, (_, i) =>
      state({
        customer_id: `c${i}`,
        assigned_user_id: "u1",
        machine_state: i < 4 ? "critical" : "follow_up",
        current_risk: i < 4 ? "critical" : "medium",
        breached_sla: i < 2,
        assigned_at: "2026-05-18T08:00:00.000Z",
      })
    );

    const snapshot = buildOperationalAnalyticsSnapshot(
      input({ operationalStates: states }),
      NOW
    );

    const op = snapshot.operators.find((o) => o.user_id === "u1");
    expect(op?.assigned_total).toBe(6);
    expect(op?.active_critical).toBeGreaterThan(0);
    expect(["elevated", "overloaded", "critical"]).toContain(op?.workload_band);
  });

  it("sticky risk weights critical > high", () => {
    expect(operationalRiskWeight("critical")).toBeGreaterThan(operationalRiskWeight("high"));
  });
});
