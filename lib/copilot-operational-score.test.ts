import { describe, expect, it } from "vitest";

import { compareOperationalFeedScore, scoreOperationalFeedItem } from "@/lib/copilot-operational-score";

describe("scoreOperationalFeedItem", () => {
  it("prioriza críticas vencidas y bloqueadas", () => {
    const overdueCritical = scoreOperationalFeedItem({
      source: "action",
      severity: "critical",
      slaStatus: "overdue",
      blocked: true,
    });
    const mediumInsight = scoreOperationalFeedItem({
      source: "insight",
      severity: "medium",
    });

    expect(overdueCritical).toBeGreaterThan(mediumInsight);
  });
});

describe("compareOperationalFeedScore", () => {
  it("ordena por score y desempata por id", () => {
    const sorted = [
      { score: 100, id: "b" },
      { score: 200, id: "a" },
      { score: 200, id: "b" },
    ].sort(compareOperationalFeedScore);

    expect(sorted.map((row) => row.id)).toEqual(["a", "b", "b"]);
  });
});
