import { describe, expect, it } from "vitest";

import type { ClientOperationalSummary, DECollectionAction, OperationalTask } from "@/lib/decision-engine/de-types";
import {
  buildClientOperationalLiveState,
  buildTimelineForCustomer,
} from "@/lib/decision-engine/client-operational-execution-context";

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
    oldest_days: 30,
    risk_level: "high",
    machine_state: "escalated",
    breached_sla: true,
    group_key: null,
    group_label: null,
    due_at: "2026-05-19T09:00:00",
  };
  return {
    customer_id: "c1",
    customer_name: "Acme",
    highest_priority: "critical",
    machine_state: "escalated",
    risk_level: "high",
    primary_action: task,
    secondary_actions: [],
    reasons: [],
    total_pending_amount: 100,
    pending_currency_breakdown: { uyu: 100, usd: 0 },
    concentration_percent: null,
    expected_impact: { recovery_amount: 100, risk_reduction: "high", concentration_reduction: null },
    sla_breached: true,
    actionable_now: true,
    tasks_count: 1,
    generated_from: [],
  };
}

describe("client-operational-execution-context", () => {
  it("timeline máximo 3 eventos", () => {
    const actions: DECollectionAction[] = [
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
      {
        id: "a2",
        company_id: "c1",
        action_type: "payment_promise",
        status: "promised_payment",
        priority: "medium",
        notes: null,
        promise_date: null,
        promise_amount: null,
        promise_currency: null,
        contact_date: null,
        created_at: "2026-05-17T10:00:00.000Z",
      },
      {
        id: "a3",
        company_id: "c1",
        action_type: "internal_note",
        status: "pending_review",
        priority: "low",
        notes: null,
        promise_date: null,
        promise_amount: null,
        promise_currency: null,
        contact_date: null,
        created_at: "2026-05-11T10:00:00.000Z",
      },
      {
        id: "a4",
        company_id: "c1",
        action_type: "email",
        status: "contacted",
        priority: "low",
        notes: null,
        promise_date: null,
        promise_amount: null,
        promise_currency: null,
        contact_date: null,
        created_at: "2026-05-10T10:00:00.000Z",
      },
    ];
    const timeline = buildTimelineForCustomer("c1", actions, 3, NOW);
    expect(timeline).toHaveLength(3);
    expect(timeline[0]?.label).toMatch(/llamada|Llamada/i);
  });

  it("estado operativo con fallback", () => {
    const live = buildClientOperationalLiveState(baseSummary(), [], NOW);
    expect(live.last_action_label).toBeNull();
    expect(live.state_label).toBe("Escalado");
    expect(live.sla_label).toMatch(/Vencido|Fuera/);
    expect(live.assignee_label).toBe("Sin asignar");
  });
});
