import { describe, expect, it } from "vitest";

import { mapOperationalStateRow } from "@/lib/data/decision-operational-state-repository";

describe("mapOperationalStateRow", () => {
  it("maps a valid DB row", () => {
    const row = mapOperationalStateRow({
      customer_id: "cust-1",
      current_risk: "high",
      operational_state: "retry_call",
      next_follow_up_at: "2026-05-20T12:00:00.000Z",
      last_contact_at: null,
      active_promise: false,
      escalated: true,
      updated_at: "2026-05-18T10:00:00.000Z",
    });

    expect(row).toEqual({
      customer_id: "cust-1",
      current_risk: "high",
      operational_state: "retry_call",
      next_follow_up_at: "2026-05-20T12:00:00.000Z",
      last_contact_at: null,
      active_promise: false,
      escalated: true,
      updated_at: "2026-05-18T10:00:00.000Z",
    });
  });

  it("falls back on invalid enum values", () => {
    const row = mapOperationalStateRow({
      customer_id: "x",
      current_risk: "unknown",
      operational_state: "bad",
      updated_at: "2026-05-18T10:00:00.000Z",
    });

    expect(row.current_risk).toBe("medium");
    expect(row.operational_state).toBe("monitor");
  });
});
