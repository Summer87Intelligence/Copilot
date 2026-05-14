import { describe, expect, it } from "vitest";

import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";
import type { OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import { buildCopilotRutasSnapshotFromInputs } from "@/lib/copilot-rutas-snapshot";

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
    due_at: "2026-05-10T00:00:00.000Z",
    resolved_at: null,
    resolution_notes: null,
    created_at: "2026-05-08T10:00:00.000Z",
    updated_at: "2026-05-13T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildCopilotRutasSnapshotFromInputs", () => {
  it("arma feed, memoria, narrativa, recomendaciones y timeline en una sola respuesta", () => {
    const feedItems: OperationalFeedItem[] = [
      {
        id: "treasury:1",
        source: "treasury",
        severity: "critical",
        score: 1_200,
        title: "Caja proyectada negativa 2026-05-13",
      },
    ];

    const snapshot = buildCopilotRutasSnapshotFromInputs({
      actions: [actionRow("blocked-1", { operational_status: "blocked", priority: "critical" })],
      events: [
        {
          id: "event-1",
          workspace_company_id: "ws-1",
          action_id: "blocked-1",
          event_type: "status_changed",
          actor_id: null,
          actor_label: "Operador",
          detail: {},
          created_at: "2026-05-14T11:00:00.000Z",
        },
      ],
      feedItems,
      treasury: {
        runwayDays: 0,
        riskLevel: "critical",
        upcomingObligationCount: 2,
        criticalAlertCount: 1,
        warningAlertCount: 0,
        hasNegativeProjection: true,
      },
      now: NOW,
      timelineLimit: 5,
    });

    expect(snapshot.generatedAt).toBe(NOW.toISOString());
    expect(snapshot.feed.items).toHaveLength(1);
    expect(snapshot.feed.groups.length).toBeGreaterThanOrEqual(0);
    expect(snapshot.memory.length).toBeGreaterThan(0);
    expect(snapshot.narratives.length).toBeGreaterThan(0);
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
    expect(snapshot.timeline).toHaveLength(1);
    expect(snapshot.counts).toEqual({
      feedItems: 1,
      groups: snapshot.feed.groups.length,
      memorySignals: snapshot.memory.length,
      narratives: snapshot.narratives.length,
      recommendations: snapshot.recommendations.length,
      timelineEvents: 1,
    });
  });

  it("limita timeline al máximo solicitado", () => {
    const snapshot = buildCopilotRutasSnapshotFromInputs({
      actions: [actionRow("a-1"), actionRow("a-2")],
      events: [
        {
          id: "event-1",
          workspace_company_id: "ws-1",
          action_id: "a-1",
          event_type: "created",
          actor_id: null,
          actor_label: "Operador",
          detail: {},
          created_at: "2026-05-14T10:00:00.000Z",
        },
        {
          id: "event-2",
          workspace_company_id: "ws-1",
          action_id: "a-2",
          event_type: "assigned",
          actor_id: null,
          actor_label: "Operador",
          detail: {},
          created_at: "2026-05-14T11:00:00.000Z",
        },
      ],
      feedItems: [],
      treasury: null,
      now: NOW,
      timelineLimit: 1,
    });

    expect(snapshot.timeline).toHaveLength(1);
    expect(snapshot.counts.timelineEvents).toBe(1);
  });
});
