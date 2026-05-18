import { describe, expect, it } from "vitest";

import {
  mapFollowUpRow,
  scheduledForDayKey,
  scheduleDateToTimestamptz,
} from "@/lib/data/decision-follow-up-repository";

describe("decision follow-up repository helpers", () => {
  it("scheduleDateToTimestamptz normalizes date-only values", () => {
    expect(scheduleDateToTimestamptz("2026-05-21")).toBe("2026-05-21T12:00:00.000Z");
    expect(scheduleDateToTimestamptz("2026-05-21T08:00:00.000Z")).toBe(
      "2026-05-21T08:00:00.000Z"
    );
  });

  it("scheduledForDayKey extracts YYYY-MM-DD", () => {
    expect(scheduledForDayKey("2026-05-21T12:00:00.000Z")).toBe("2026-05-21");
  });

  it("mapFollowUpRow maps enums safely", () => {
    const row = mapFollowUpRow({
      id: "fu-1",
      customer_id: "c1",
      status: "pending",
      scheduled_for: "2026-05-21T12:00:00.000Z",
      reason: "Confirmar pago",
      source_action_id: "act-1",
      priority: "high",
    });

    expect(row.id).toBe("fu-1");
    expect(row.status).toBe("pending");
    expect(row.priority).toBe("high");
  });
});
