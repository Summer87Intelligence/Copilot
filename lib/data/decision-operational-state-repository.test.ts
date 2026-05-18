import { describe, expect, it } from "vitest";

import { mapOperationalStateRow } from "@/lib/data/decision-operational-state-repository";

describe("mapOperationalStateRow", () => {
  it("maps Phase 2A machine state fields", () => {
    const row = mapOperationalStateRow({
      customer_id: "cust-1",
      current_risk: "high",
      operational_state: "escalated",
      previous_state: "monitoring",
      transitioned_at: "2026-05-18T10:00:00.000Z",
      transition_reason: "Promesa vencida",
      breached_sla: true,
      next_follow_up_at: "2026-05-20T12:00:00.000Z",
      last_contact_at: null,
      active_promise: false,
      escalated: true,
      updated_at: "2026-05-18T10:00:00.000Z",
    });

    expect(row.machine_state).toBe("escalated");
    expect(row.legacy_follow_up_state).toBe("escalated_active");
    expect(row.previous_state).toBe("monitoring");
    expect(row.breached_sla).toBe(true);
    expect(row.transition_reason).toBe("Promesa vencida");
  });

  it("normalizes legacy operational_state values", () => {
    const row = mapOperationalStateRow({
      customer_id: "x",
      current_risk: "low",
      operational_state: "awaiting_promise",
      updated_at: "2026-05-18T10:00:00.000Z",
    });

    expect(row.machine_state).toBe("payment_promised");
    expect(row.legacy_follow_up_state).toBe("awaiting_promise");
  });
});
