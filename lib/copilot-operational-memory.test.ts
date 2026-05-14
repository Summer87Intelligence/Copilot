import { describe, expect, it } from "vitest";

import type {
  OperationalActionEventRow,
  OperationalActionListItem,
} from "@/lib/copilot-operational-actions-types";
import type { OperationalFeedGroup, OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import { buildOperationalMemorySignals } from "@/lib/copilot-operational-memory";

const NOW = new Date("2026-05-14T12:00:00.000Z");

function actionRow(
  id: string,
  overrides: Partial<OperationalActionListItem> = {}
): OperationalActionListItem {
  return {
    id,
    workspace_company_id: "ws-1",
    origin: "manual",
    action_type: "follow_up",
    priority: "high",
    operational_status: "pending",
    owner_id: null,
    assigned_to: "Operador",
    created_by: "Operador",
    related_entity_type: null,
    related_entity_id: id,
    title: `Seguimiento ${id}`,
    summary: null,
    context: {},
    metadata: {},
    due_at: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: "2026-05-08T10:00:00.000Z",
    updated_at: "2026-05-13T10:00:00.000Z",
    ...overrides,
  };
}

function eventRow(
  id: string,
  actionId: string,
  overrides: Partial<OperationalActionEventRow> = {}
): OperationalActionEventRow {
  return {
    id,
    workspace_company_id: "ws-1",
    action_id: actionId,
    event_type: "resolved",
    actor_id: null,
    actor_label: "Operador",
    detail: {},
    created_at: "2026-05-14T09:00:00.000Z",
    ...overrides,
  };
}

describe("buildOperationalMemorySignals", () => {
  it("detecta seguimiento abierto por más de 3 días", () => {
    const signals = buildOperationalMemorySignals(
      {
        actions: [actionRow("old-1", { created_at: "2026-05-08T10:00:00.000Z" })],
        events: [],
        feedItems: [],
        now: NOW,
      },
      5
    );

    expect(signals.some((signal) => signal.type === "open_too_long")).toBe(true);
    expect(signals.some((signal) => signal.title.includes("6 días"))).toBe(true);
  });

  it("detecta bloqueo crítico abierto", () => {
    const signals = buildOperationalMemorySignals({
      actions: [
        actionRow("blocked-1", {
          operational_status: "blocked",
          priority: "critical",
        }),
      ],
      events: [],
      feedItems: [],
      now: NOW,
    });

    expect(signals.some((signal) => signal.title === "Bloqueo crítico sigue abierto")).toBe(true);
  });

  it("detecta prioridad sin responsable", () => {
    const signals = buildOperationalMemorySignals({
      actions: [
        actionRow("unassigned-1", {
          assigned_to: null,
          priority: "critical",
        }),
      ],
      events: [],
      feedItems: [],
      now: NOW,
    });

    expect(signals.some((signal) => signal.title === "Prioridad sin responsable")).toBe(true);
  });

  it("detecta cierre reciente", () => {
    const signals = buildOperationalMemorySignals({
      actions: [actionRow("done-1", { operational_status: "resolved", priority: "high" })],
      events: [eventRow("evt-1", "done-1")],
      feedItems: [],
      now: NOW,
    });

    expect(signals.some((signal) => signal.type === "resolved_recently")).toBe(true);
  });

  it("no inventa señales sin evidencia", () => {
    const signals = buildOperationalMemorySignals({
      actions: [
        actionRow("fresh-1", {
          created_at: "2026-05-13T10:00:00.000Z",
          updated_at: "2026-05-13T10:00:00.000Z",
          assigned_to: "Ana",
          priority: "medium",
        }),
      ],
      events: [],
      feedItems: [],
      now: NOW,
    });

    expect(signals).toHaveLength(0);
  });

  it("detecta riesgo recurrente en feed agrupado", () => {
    const feedItems: OperationalFeedItem[] = [
      {
        id: "treasury:1",
        source: "treasury",
        severity: "critical",
        score: 1_200,
        title: "Caja proyectada negativa 2026-05-13",
      },
      {
        id: "treasury:2",
        source: "treasury",
        severity: "critical",
        score: 1_100,
        title: "Caja proyectada negativa 2026-05-14",
      },
    ];
    const feedGroups: OperationalFeedGroup[] = [
      {
        id: "group:treasury",
        source: "treasury",
        severity: "critical",
        score: 1_200,
        title: "Caja proyectada negativa · 2 días consecutivos",
        summary: "Riesgo de caja concentrado en los próximos días.",
        itemCount: 2,
        primaryItem: feedItems[0],
        items: feedItems,
        collapsedByDefault: true,
      },
    ];

    const signals = buildOperationalMemorySignals({
      actions: [],
      events: [],
      feedItems,
      feedGroups,
      now: NOW,
    });

    expect(signals.some((signal) => signal.type === "recurring_issue")).toBe(true);
  });
});
