import { describe, expect, it } from "vitest";

import {
  buildDedupeKey,
  filterActionsByDedupe,
} from "@/lib/decision-engine/operational-automation-dedupe";
import type { AutomationAction } from "@/lib/decision-engine/de-types";

describe("operational-automation-dedupe", () => {
  it("buildDedupeKey incluye alert type", () => {
    expect(buildDedupeKey("concentration_critical_alert", "c1", "alert_x")).toBe(
      "concentration_critical_alert:c1:alert_x"
    );
  });

  it("filtra duplicados en la misma corrida", () => {
    const a: AutomationAction = {
      rule_key: "no_contact_14d",
      action_type: "create_follow_up",
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
