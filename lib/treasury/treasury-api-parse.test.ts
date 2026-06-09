import { describe, expect, it } from "vitest";

import {
  canonicalTreasuryRollup,
  parseTreasuryCashPositionJson,
  parseTreasuryScheduledSummaryJson,
} from "@/lib/treasury/treasury-api-parse";

describe("treasury-api-parse", () => {
  it("parseTreasuryCashPositionJson lee data.positions", () => {
    const json = {
      ok: true,
      data: {
        positions: [
          { currency: "UYU", availableCash: 402_646, openingBalance: 0 },
          { currency: "USD", availableCash: 14_464, openingBalance: 0 },
        ],
      },
    };
    const positions = parseTreasuryCashPositionJson(json);
    expect(positions).toHaveLength(2);
    expect(positions[0]?.availableCash).toBe(402_646);
  });

  it("parseTreasuryCashPositionJson ignora shape legacy positions top-level", () => {
    expect(parseTreasuryCashPositionJson({ positions: [{ currency: "UYU" }] })).toEqual([]);
  });

  it("parseTreasuryScheduledSummaryJson lee data.summary", () => {
    const json = {
      ok: true,
      data: {
        summary: [
          { currency: "UYU", next30Days: 50_000, itemsCount: 2 },
          { currency: "USD", next30Days: 1_200, itemsCount: 1 },
        ],
      },
    };
    expect(parseTreasuryScheduledSummaryJson(json)).toHaveLength(2);
  });

  it("canonicalTreasuryRollup = availableCash − next30Days", () => {
    const rollup = canonicalTreasuryRollup(
      [
        { currency: "UYU", availableCash: 402_646 } as never,
        { currency: "USD", availableCash: 14_464 } as never,
      ],
      [
        { currency: "UYU", next30Days: 100_000 } as never,
        { currency: "USD", next30Days: 2_000 } as never,
      ]
    );
    expect(rollup.availableCash.UYU).toBe(402_646);
    expect(rollup.safeCash30d.UYU).toBe(302_646);
    expect(rollup.safeCash30d.USD).toBe(12_464);
  });
});
