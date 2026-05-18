import { describe, expect, it } from "vitest";

import { indexDecisionEngineOperationalData } from "@/lib/data/decision-engine-data-loader";
import { buildHydrationByCustomer } from "@/lib/decision-engine/client-operational-hydration-builder";

describe("buildHydrationByCustomer", () => {
  it("indexa follow-up pendiente por cliente", () => {
    const index = indexDecisionEngineOperationalData({
      operationalStates: [],
      pendingFollowUps: [
        {
          id: "fu-1",
          customer_id: "c9",
          status: "pending",
          scheduled_for: "2026-05-20T12:00:00.000Z",
          reason: "Llamar de nuevo",
          source_action_id: null,
          priority: "high",
        },
      ],
      recentActions: [],
    });
    const map = buildHydrationByCustomer(["c9"], index);
    expect(map.c9?.pending_follow_up_id).toBe("fu-1");
    expect(map.c9?.pending_follow_up_reason).toBe("Llamar de nuevo");
  });
});
