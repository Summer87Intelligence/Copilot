import { describe, expect, it } from "vitest";

import { evaluateOperationalSla } from "@/lib/decision-engine/operational-sla-engine";

const NOW = new Date("2026-05-18T12:00:00.000Z");

describe("evaluateOperationalSla", () => {
  it("detecta breach en monitoring tras 14 días", () => {
    const r = evaluateOperationalSla({
      machine_state: "monitoring",
      transitioned_at: "2026-05-01T12:00:00.000Z",
      current_risk: "medium",
      promise_date: null,
      has_active_promise: false,
      now: NOW,
    });
    expect(r.breached).toBe(true);
    expect(r.priority_boost_steps).toBeGreaterThan(0);
  });

  it("promesa vencida breach", () => {
    const r = evaluateOperationalSla({
      machine_state: "payment_promised",
      transitioned_at: "2026-05-01T12:00:00.000Z",
      current_risk: "low",
      promise_date: "2026-05-15",
      has_active_promise: true,
      now: NOW,
    });
    expect(r.breached).toBe(true);
    expect(r.reason).toContain("Promesa");
  });

  it("recovered sin SLA", () => {
    const r = evaluateOperationalSla({
      machine_state: "recovered",
      transitioned_at: "2026-01-01T12:00:00.000Z",
      current_risk: "low",
      promise_date: null,
      has_active_promise: false,
      now: NOW,
    });
    expect(r.breached).toBe(false);
    expect(r.max_days).toBeNull();
  });
});
