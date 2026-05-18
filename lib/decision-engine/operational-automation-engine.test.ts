import { describe, expect, it } from "vitest";

import {
  AUTOMATION_RULE_COUNT,
  evaluateAutomationRules,
} from "@/lib/decision-engine/operational-automation-engine";
import { buildDedupeKey, filterActionsByDedupe } from "@/lib/decision-engine/operational-automation-dedupe";
import type {
  AutomationCustomerContext,
  AutomationEvaluationInput,
  DEOperationalStateRow,
} from "@/lib/decision-engine/de-types";

const NOW = new Date("2026-05-18T14:00:00.000Z");

function state(
  customerId: string,
  overrides: Partial<DEOperationalStateRow> = {}
): DEOperationalStateRow {
  return {
    customer_id: customerId,
    current_risk: "high",
    machine_state: "follow_up",
    legacy_follow_up_state: "monitor",
    previous_state: null,
    transitioned_at: "2026-05-10T10:00:00.000Z",
    transition_reason: null,
    breached_sla: false,
    next_follow_up_at: null,
    last_contact_at: "2026-04-01T10:00:00.000Z",
    active_promise: false,
    escalated: false,
    updated_at: "2026-05-18T08:00:00.000Z",
    assigned_user_id: null,
    assigned_at: null,
    assigned_by: null,
    assignment_note: null,
    ...overrides,
  };
}

function ctx(
  customerId: string,
  overrides: Partial<AutomationCustomerContext> = {}
): AutomationCustomerContext {
  return {
    customer_id: customerId,
    state: state(customerId),
    pending_follow_up: null,
    recent_actions: [],
    concentration_pct: 0,
    oldest_invoice_days: 0,
    pending_balance: 1000,
    last_action_at: null,
    last_contact_at: "2026-04-01T10:00:00.000Z",
    has_partial_payment_recent: false,
    ...overrides,
  };
}

describe("operational-automation-engine", () => {
  it("evalúa las 7 reglas base", () => {
    expect(AUTOMATION_RULE_COUNT).toBe(7);
  });

  it("critical unowned > 2h → auto_assign", () => {
    const input: AutomationEvaluationInput = {
      customers: [
        ctx("c1", {
          state: state("c1", {
            current_risk: "critical",
            machine_state: "critical",
            transitioned_at: "2026-05-18T08:00:00.000Z",
            assigned_user_id: null,
          }),
        }),
      ],
      operatorNames: new Map([["u1", "Ana"]]),
      loadedAt: NOW.toISOString(),
    };
    const actions = evaluateAutomationRules(input, NOW);
    expect(actions.some((a) => a.rule_key === "critical_unowned_2h")).toBe(true);
  });

  it("SLA breach 48h → increase_priority", () => {
    const actions = evaluateAutomationRules(
      {
        customers: [
          ctx("c2", {
            state: state("c2", {
              breached_sla: true,
              transitioned_at: "2026-05-15T10:00:00.000Z",
              current_risk: "high",
            }),
          }),
        ],
        operatorNames: new Map(),
        loadedAt: NOW.toISOString(),
      },
      NOW
    );
    expect(actions.some((a) => a.rule_key === "sla_breach_48h")).toBe(true);
  });

  it("concentración + crítico → alert", () => {
    const actions = evaluateAutomationRules(
      {
        customers: [
          ctx("c3", {
            concentration_pct: 55,
            state: state("c3", { current_risk: "critical", machine_state: "escalated" }),
          }),
        ],
        operatorNames: new Map(),
        loadedAt: NOW.toISOString(),
      },
      NOW
    );
    expect(actions.some((a) => a.action_type === "create_operational_alert")).toBe(true);
  });
});

describe("operational-automation-dedupe", () => {
  it("filtra duplicados en la misma corrida", () => {
    const a = {
      rule_key: "no_contact_14d" as const,
      action_type: "create_follow_up" as const,
      customer_id: "c1",
      dedupe_key: buildDedupeKey("no_contact_14d", "c1"),
      priority: 1,
      reason: "x",
      payload: {},
    };
    const { allowed, deduped } = filterActionsByDedupe([a, a], new Set(), new Set());
    expect(allowed).toHaveLength(1);
    expect(deduped).toBe(1);
  });
});
