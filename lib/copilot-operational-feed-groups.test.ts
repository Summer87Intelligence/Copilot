import { describe, expect, it } from "vitest";

import type { OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import {
  buildGroupedOperationalFeed,
  buildOperationalFeedGroups,
  pickExecutiveFeedPriorities,
} from "@/lib/copilot-operational-feed-groups";

function treasuryItem(date: string, score: number): OperationalFeedItem {
  return {
    id: `treasury:${date}`,
    source: "treasury",
    severity: "critical",
    score,
    title: `Caja proyectada negativa ${date}`,
    summary: `Saldo proyectado negativo el ${date}.`,
    cta: { label: "Ir a Tesorería", href: "/copilot/tesoreria" },
    quickActions: ["open"],
    href: "/copilot/tesoreria",
    metadata: { treasuryAlertType: "negative_cash_projection" },
  };
}

function actionItem(
  id: string,
  origin: string,
  relatedEntityId: string,
  score: number,
  overrides: Partial<OperationalFeedItem> = {}
): OperationalFeedItem {
  return {
    id: `action:${id}`,
    source: "action",
    severity: "high",
    score,
    title: `Seguimiento ${id}`,
    summary: "Hay seguimiento abierto.",
    cta: { label: "Abrir acción", href: `/copilot/acciones?actionId=${id}` },
    quickActions: ["open", "assign_to_me", "resolve"],
    href: `/copilot/acciones?actionId=${id}`,
    metadata: { actionId: id, origin, relatedEntityId },
    ...overrides,
  };
}

describe("buildOperationalFeedGroups", () => {
  it("consolida alertas de tesorería por día en un solo grupo", () => {
    const items = [
      treasuryItem("2026-05-16", 900),
      treasuryItem("2026-05-13", 1200),
      treasuryItem("2026-05-14", 1100),
      treasuryItem("2026-05-15", 1000),
    ];

    const groups = buildOperationalFeedGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.itemCount).toBe(4);
    expect(groups[0]?.title).toContain("Caja proyectada negativa");
    expect(groups[0]?.title).toContain("4 días consecutivos");
    expect(groups[0]?.summary).toContain("Riesgo de caja concentrado");
  });

  it("agrupa acciones del mismo origen y entidad", () => {
    const items = [
      actionItem("a1", "alert", "alert-liquidez", 800),
      actionItem("a2", "alert", "alert-liquidez", 950),
    ];

    const groups = buildOperationalFeedGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.itemCount).toBe(2);
    expect(groups[0]?.primaryItem.id).toBe("action:a2");
  });

  it("prioriza critical/high y vencidas sin duplicar grupos", () => {
    const items = [
      treasuryItem("2026-05-13", 1500),
      treasuryItem("2026-05-14", 1400),
      actionItem("blocked", "manual", "manual-1", 1300, {
        blocked: true,
        severity: "critical",
        metadata: { actionId: "blocked", origin: "manual", relatedEntityId: "manual-1" },
      }),
      {
        id: "insight:deuda",
        source: "customer" as const,
        severity: "high" as const,
        score: 700,
        title: "Cliente con deuda vencida",
        summary: "Cobranza prioritaria.",
        metadata: { insightType: "deuda_vencida", companyId: "c1" },
      },
      {
        id: "insight:deuda-2",
        source: "customer" as const,
        severity: "high" as const,
        score: 650,
        title: "Cliente con deuda vencida (otro)",
        summary: "Cobranza prioritaria.",
        metadata: { insightType: "deuda_vencida", companyId: "c1" },
      },
    ];

    const groups = buildOperationalFeedGroups(items);
    const priorities = pickExecutiveFeedPriorities(groups, 3);
    expect(priorities.length).toBeLessThanOrEqual(3);
    expect(priorities[0]?.id).toContain("treasury");
    expect(new Set(priorities.map((group) => group.id)).size).toBe(priorities.length);
  });

  it("separa prioridades del resto del feed agrupado", () => {
    const items = [
      treasuryItem("2026-05-13", 1600),
      treasuryItem("2026-05-14", 1500),
      actionItem("x1", "alert", "entity-a", 1200),
      actionItem("x2", "alert", "entity-b", 1100),
    ];

    const { groups, priorities } = buildGroupedOperationalFeed(items);
    expect(priorities).toHaveLength(3);
    expect(groups).toHaveLength(0);
  });
});
