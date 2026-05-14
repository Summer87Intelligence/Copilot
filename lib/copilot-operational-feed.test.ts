import { describe, expect, it } from "vitest";

import type { OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import { compareOperationalFeedScore } from "@/lib/copilot-operational-score";

function item(id: string, score: number): OperationalFeedItem {
  return {
    id,
    source: "action",
    severity: "high",
    score,
    title: id,
  };
}

describe("operational feed ordering", () => {
  it("mantiene orden estable por score e id", () => {
    const sorted = [
      item("action:2", 1200),
      item("alert:1", 1800),
      item("action:1", 1800),
    ].sort(compareOperationalFeedScore);

    expect(sorted.map((row) => row.id)).toEqual(["action:1", "alert:1", "action:2"]);
  });
});
