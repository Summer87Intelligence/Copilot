import { describe, expect, it, vi } from "vitest";

import { filterActionsByDedupe } from "@/lib/decision-engine/operational-automation-dedupe";
import type { AutomationAction } from "@/lib/decision-engine/de-types";

describe("operational-automation-runner dedupe", () => {
  it("idempotencia: misma dedupe_key bloqueada en corrida", () => {
    const action: AutomationAction = {
      rule_key: "sla_breach_48h",
      action_type: "increase_priority",
      customer_id: "c1",
      dedupe_key: "sla_breach_48h:c1",
      priority: 80,
      reason: "test",
      payload: {},
    };
    const blocked = new Set(["sla_breach_48h:c1"]);
    const { allowed, deduped } = filterActionsByDedupe([action], blocked, new Set());
    expect(allowed).toHaveLength(0);
    expect(deduped).toBe(1);
  });
});

vi.mock("@/lib/data/decision-automation-repository", () => ({
  createAutomationRun: vi.fn(),
  completeAutomationRun: vi.fn(),
  insertAutomationActions: vi.fn(),
  findActiveAutomationRun: vi.fn(),
  findRecentDedupeKeys: vi.fn(),
  markAutomationActionExecuted: vi.fn(),
}));
