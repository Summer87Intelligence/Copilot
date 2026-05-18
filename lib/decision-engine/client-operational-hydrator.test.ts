import { describe, expect, it } from "vitest";

import { indexDecisionEngineOperationalData } from "@/lib/data/decision-engine-data-loader";
import { buildHydrationRecordForCustomer } from "@/lib/decision-engine/client-operational-hydration-builder";
import { hydrateClientOperationalSummary } from "@/lib/decision-engine/client-operational-hydrator";
import type {
  ClientOperationalSummary,
  DEOperationalStateRow,
  OperationalTask,
} from "@/lib/decision-engine/de-types";

const NOW = new Date("2026-05-18T14:00:00.000Z");

function baseSummary(): ClientOperationalSummary {
  const task: OperationalTask = {
    id: "t1",
    customer_id: "c1",
    company_name: "Acme",
    section: "urgent_today",
    category: "call_today",
    priority: "critical",
    impact: "high",
    source: "state_machine",
    title: "x",
    action_label: "Llamar",
    reason: "test",
    priority_score: 80,
    currency_code: "UYU",
    pending_amount: 100,
    oldest_days: 95,
    risk_level: "high",
    machine_state: "monitoring",
    breached_sla: false,
    group_key: null,
    group_label: null,
    due_at: null,
  };
  return {
    customer_id: "c1",
    customer_name: "Acme",
    highest_priority: "critical",
    machine_state: "monitoring",
    risk_level: "high",
    primary_action: task,
    secondary_actions: [],
    reasons: [],
    total_pending_amount: 100,
    pending_currency_breakdown: { uyu: 100, usd: 0 },
    concentration_percent: null,
    expected_impact: { recovery_amount: 100, risk_reduction: "high", concentration_reduction: null },
    sla_breached: false,
    actionable_now: true,
    tasks_count: 1,
    generated_from: [],
  };
}

describe("hydrateClientOperationalSummary", () => {
  it("usa estado DB cuando hay record", () => {
    const state: DEOperationalStateRow = {
      customer_id: "c1",
      current_risk: "critical",
      machine_state: "escalated",
      legacy_follow_up_state: "escalated_active",
      previous_state: "follow_up",
      transitioned_at: "2026-05-15T10:00:00.000Z",
      transition_reason: "SLA breach",
      breached_sla: true,
      next_follow_up_at: "2026-05-19T09:00:00.000Z",
      last_contact_at: "2026-05-17T12:00:00.000Z",
      active_promise: false,
      escalated: true,
      updated_at: "2026-05-18T00:00:00.000Z",
      assigned_user_id: "op-1",
      assigned_at: "2026-05-18T08:00:00.000Z",
      assigned_by: "op-2",
      assignment_note: null,
    };
    const index = indexDecisionEngineOperationalData({
      operationalStates: [state],
      pendingFollowUps: [
        {
          id: "fu1",
          customer_id: "c1",
          status: "pending",
          scheduled_for: "2026-05-19T09:00:00.000Z",
          reason: "Seguimiento prometido",
          source_action_id: null,
          priority: "high",
        },
      ],
      recentActions: [
        {
          id: "a1",
          company_id: "c1",
          action_type: "call",
          status: "contacted",
          priority: "high",
          notes: null,
          promise_date: null,
          promise_amount: null,
          promise_currency: null,
          contact_date: null,
          created_at: "2026-05-18T14:32:00.000Z",
        },
      ],
    });
    const record = buildHydrationRecordForCustomer("c1", index, NOW)!;
    const hydrated = hydrateClientOperationalSummary(baseSummary(), record, "op-1", NOW);

    expect(hydrated.hydration_source).toBe("db");
    expect(hydrated.live_ownership.is_mine).toBe(true);
    expect(hydrated.live_state.assignee_label).toBe("Sin asignar");
    expect(hydrated.machine_state).toBe("escalated");
    expect(hydrated.sla_breached).toBe(true);
    expect(hydrated.live_state.state_label).toBe("Escalado");
    expect(hydrated.live_follow_up.id).toBe("fu1");
    expect(hydrated.live_timeline).toHaveLength(1);
    expect(hydrated.live_timeline[0]?.action_type).toBe("call");
  });

  it("fallback sin record", () => {
    const hydrated = hydrateClientOperationalSummary(baseSummary(), null, null, NOW);
    expect(hydrated.hydration_source).toBe("fallback");
    expect(hydrated.live_state.transitioned_at).toBeNull();
  });

  it("timeline max 3 en builder", () => {
    const index = indexDecisionEngineOperationalData({
      operationalStates: [],
      pendingFollowUps: [],
      recentActions: Array.from({ length: 5 }, (_, i) => ({
        id: `a${i}`,
        company_id: "c1",
        action_type: "call",
        status: "contacted",
        priority: "low",
        notes: null,
        promise_date: null,
        promise_amount: null,
        promise_currency: null,
        contact_date: null,
        created_at: `2026-05-${10 + i}T10:00:00.000Z`,
      })),
    });
    const record = buildHydrationRecordForCustomer("c1", index, NOW)!;
    expect(record.timeline_preview.length).toBeLessThanOrEqual(3);
  });
});
