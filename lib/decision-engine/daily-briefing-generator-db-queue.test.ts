import { describe, expect, it } from "vitest";

import { generateDailyBriefing } from "@/lib/decision-engine/daily-briefing-generator";
import type { DecisionEngineDataBundle } from "@/lib/decision-engine/de-types";

function emptyBundle(
  overrides: Partial<DecisionEngineDataBundle> = {}
): DecisionEngineDataBundle {
  return {
    pendingInvoices: [],
    recentInvoices: [],
    recentReceipts: [],
    companies: [],
    recentActions: [],
    operationalStates: [],
    pendingFollowUps: [],
    loadedAt: "2026-05-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("generateDailyBriefing — DB-first follow_up_queue", () => {
  it("prefers pending follow-ups from DB when present", () => {
    const briefing = generateDailyBriefing(
      emptyBundle({
        companies: [{ id: "c1", name: "Cliente DB" }],
        operationalStates: [
          {
            customer_id: "c1",
            current_risk: "high",
            machine_state: "escalated",
            legacy_follow_up_state: "escalated_active",
            previous_state: "monitoring",
            transitioned_at: "2026-05-18T10:00:00.000Z",
            transition_reason: "Escalación formal",
            breached_sla: false,
            next_follow_up_at: "2026-05-19T12:00:00.000Z",
            last_contact_at: null,
            active_promise: false,
            escalated: true,
            updated_at: "2026-05-18T10:00:00.000Z",
          },
        ],
        pendingFollowUps: [
          {
            id: "fu-1",
            customer_id: "c1",
            status: "pending",
            scheduled_for: "2026-05-19T12:00:00.000Z",
            reason: "Gestionar escalación",
            source_action_id: "act-1",
            priority: "high",
          },
        ],
      })
    );

    expect(briefing.follow_up_queue).toHaveLength(1);
    expect(briefing.follow_up_queue[0]?.company_id).toBe("c1");
    expect(briefing.follow_up_queue[0]?.company_name).toBe("Cliente DB");
    expect(briefing.follow_up_queue[0]?.follow_up_result.operational_state).toBe(
      "escalated_active"
    );
    expect(briefing.follow_up_queue[0]?.follow_up_result.follow_up_reason).toBe(
      "Escalación formal"
    );
  });

  it("falls back to ranked queue when DB rows are not actionable", () => {
    const briefing = generateDailyBriefing(
      emptyBundle({
        pendingFollowUps: [
          {
            id: "fu-2",
            customer_id: "missing",
            status: "pending",
            scheduled_for: "2027-01-01T12:00:00.000Z",
            reason: "Lejano",
            source_action_id: null,
            priority: "low",
          },
        ],
      })
    );

    expect(briefing.follow_up_queue).toEqual([]);
  });
});
