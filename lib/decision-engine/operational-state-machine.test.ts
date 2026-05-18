import { describe, expect, it } from "vitest";

import {
  canTransition,
  resolveOperationalTransition,
} from "@/lib/decision-engine/operational-state-machine";
import type { StateTransitionInput } from "@/lib/decision-engine/de-types";

const NOW = new Date("2026-05-18T12:00:00Z");

function baseInput(overrides: Partial<StateTransitionInput> = {}): StateTransitionInput {
  return {
    current_state: "monitoring",
    transitioned_at: "2026-05-10T12:00:00.000Z",
    action_type: null,
    action_status: null,
    risk_delta: 0,
    risk_score: 30,
    has_active_promise: false,
    has_broken_promise: false,
    has_escalation: false,
    oldest_days: 45,
    days_since_contact: 5,
    pending_balance: 5000,
    dominant_bucket: "31-60",
    payment_event: "none",
    is_paused: false,
    is_legal_review: false,
    sla_breached: false,
    sla_severity: "low",
    now: NOW,
    ...overrides,
  };
}

describe("canTransition — invalid loops", () => {
  it("blocks recovered → critical without new_risk", () => {
    expect(canTransition("recovered", "critical")).toBe(false);
  });

  it("blocks critical → monitoring", () => {
    expect(canTransition("critical", "monitoring")).toBe(false);
  });

  it("allows recovered → new_risk when debt returns", () => {
    expect(canTransition("recovered", "new_risk")).toBe(true);
  });
});

describe("resolveOperationalTransition — auto transitions", () => {
  it("promesa vencida → escalated", () => {
    const r = resolveOperationalTransition(
      baseInput({
        current_state: "payment_promised",
        has_broken_promise: true,
      })
    );
    expect(r.next_state).toBe("escalated");
    expect(r.transitioned).toBe(true);
  });

  it("pago total → recovered", () => {
    const r = resolveOperationalTransition(
      baseInput({
        pending_balance: 0,
        payment_event: "full",
      })
    );
    expect(r.next_state).toBe("recovered");
  });

  it("+90 días → critical", () => {
    const r = resolveOperationalTransition(
      baseInput({
        oldest_days: 95,
        current_state: "monitoring",
      })
    );
    expect(r.next_state).toBe("critical");
    expect(r.severity).toBe("critical");
  });

  it("sin contacto 14 días → escalated", () => {
    const r = resolveOperationalTransition(
      baseInput({
        days_since_contact: 20,
        oldest_days: 30,
        current_state: "monitoring",
      })
    );
    expect(r.next_state).toBe("escalated");
  });

  it("promesa activa → payment_promised", () => {
    const r = resolveOperationalTransition(
      baseInput({
        has_active_promise: true,
        action_type: "call",
        action_status: "contacted",
      })
    );
    expect(r.next_state).toBe("payment_promised");
  });

  it("escalation action → escalated", () => {
    const r = resolveOperationalTransition(
      baseInput({
        action_type: "escalation",
        action_status: "escalated",
      })
    );
    expect(r.next_state).toBe("escalated");
  });
});

describe("resolveOperationalTransition — SLA breach", () => {
  it("monitoring + SLA breach → follow_up", () => {
    const r = resolveOperationalTransition(
      baseInput({
        current_state: "monitoring",
        sla_breached: true,
        sla_severity: "high",
      })
    );
    expect(r.next_state).toBe("follow_up");
    expect(r.breached_sla).toBe(true);
  });

  it("escalated + SLA breach → critical", () => {
    const r = resolveOperationalTransition(
      baseInput({
        current_state: "escalated",
        sla_breached: true,
        sla_severity: "critical",
      })
    );
    expect(r.next_state).toBe("critical");
  });
});

describe("resolveOperationalTransition — recovery flow", () => {
  it("recovered con nueva deuda → new_risk", () => {
    const r = resolveOperationalTransition(
      baseInput({
        current_state: "recovered",
        pending_balance: 1200,
        payment_event: "none",
        action_type: null,
        action_status: null,
        oldest_days: 10,
      })
    );
    expect(r.next_state).toBe("new_risk");
  });
});
