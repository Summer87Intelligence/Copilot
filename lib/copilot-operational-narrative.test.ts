import { describe, expect, it } from "vitest";

import type { OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import {
  buildOperationalNarratives,
  buildTreasuryNarrativeContext,
} from "@/lib/copilot-operational-narrative";

function actionItem(
  id: string,
  overrides: Partial<OperationalFeedItem> = {}
): OperationalFeedItem {
  return {
    id: `action:${id}`,
    source: "action",
    severity: "high",
    score: 900,
    title: `Seguimiento ${id}`,
    metadata: { actionId: id, origin: "manual", relatedEntityId: id },
    ...overrides,
  };
}

describe("buildOperationalNarratives", () => {
  it("prioriza caja crítica con runway 0 y obligaciones próximas", () => {
    const narratives = buildOperationalNarratives({
      items: [],
      treasury: {
        runwayDays: 0,
        riskLevel: "critical",
        upcomingObligationCount: 2,
        criticalAlertCount: 1,
        warningAlertCount: 0,
        hasNegativeProjection: true,
      },
    });

    expect(narratives[0]?.title).toBe("Caja crítica");
    expect(narratives[0]?.cause).toContain("obligaciones próximas");
    expect(narratives[0]?.recommendation).toContain("cobranza");
  });

  it("genera narrativa de seguimientos bloqueados", () => {
    const narratives = buildOperationalNarratives({
      items: [
        actionItem("b1", { blocked: true, severity: "critical", score: 1_500 }),
        actionItem("b2", { blocked: true, severity: "high", score: 1_200 }),
      ],
    });

    expect(narratives.some((row) => row.title === "Seguimientos bloqueados")).toBe(true);
  });

  it("genera cobertura insuficiente con ratio menor a 1", () => {
    const narratives = buildOperationalNarratives({
      items: [],
      finance: {
        coverageRatio: 0.82,
        liquidityBalance: 120_000,
      },
    });

    expect(narratives.some((row) => row.title === "Cobertura financiera insuficiente")).toBe(true);
  });

  it("limita a 3 narrativas sin duplicar ids", () => {
    const narratives = buildOperationalNarratives(
      {
        items: [
          actionItem("b1", { blocked: true, severity: "critical", score: 1_500 }),
          actionItem("o1", {
            severity: "high",
            score: 1_300,
            metadata: { actionId: "o1", slaStatus: "overdue" },
          }),
          {
            id: "customer:1",
            source: "customer",
            severity: "high",
            score: 1_100,
            title: "Deuda vencida",
            metadata: { insightType: "deuda_vencida", companyId: "c1" },
          },
        ],
        treasury: {
          runwayDays: 0,
          riskLevel: "critical",
          upcomingObligationCount: 3,
          criticalAlertCount: 2,
          warningAlertCount: 1,
          hasNegativeProjection: true,
        },
        finance: {
          coverageRatio: 0.7,
          liquidityBalance: -10_000,
        },
      },
      3
    );

    expect(narratives.length).toBeLessThanOrEqual(3);
    expect(new Set(narratives.map((row) => row.id)).size).toBe(narratives.length);
    expect(narratives[0]?.severity).toBe("critical");
  });
});

describe("buildTreasuryNarrativeContext", () => {
  it("detecta proyección negativa en los próximos 7 días", () => {
    const context = buildTreasuryNarrativeContext({
      projection: {
        runwayDays: 4,
        riskLevel: "warning",
        snapshots: [
          { projectedCashUyu: 100 },
          { projectedCashUyu: -20 },
          { projectedCashUyu: 50 },
        ],
      },
      upcoming7: [{}],
      criticalAlertCount: 0,
      warningAlertCount: 1,
    });

    expect(context?.hasNegativeProjection).toBe(true);
    expect(context?.upcomingObligationCount).toBe(1);
  });
});
