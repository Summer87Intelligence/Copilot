import { describe, expect, it } from "vitest";

import type {
  OperationalActionListItem,
} from "@/lib/copilot-operational-actions-types";
import type { OperationalFeedGroup, OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";
import { buildStrategicRecommendations } from "@/lib/copilot-strategic-recommendations";

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

function memorySignal(
  id: string,
  overrides: Partial<OperationalMemorySignal> = {}
): OperationalMemorySignal {
  return {
    id,
    type: "open_too_long",
    severity: "high",
    title: "Seguimiento abierto hace 6 días",
    summary: "La acción sigue abierta sin cierre.",
    evidence: [],
    score: 3_000,
    ...overrides,
  };
}

describe("buildStrategicRecommendations", () => {
  it("recomienda cobranza y pagos críticos con caja crítica y runway 0", () => {
    const recommendations = buildStrategicRecommendations({
      actions: [],
      feedItems: [],
      narratives: [],
      memorySignals: [],
      treasury: {
        runwayDays: 0,
        riskLevel: "critical",
        upcomingObligationCount: 2,
        criticalAlertCount: 1,
        warningAlertCount: 0,
        hasNegativeProjection: true,
      },
      now: NOW,
    });

    expect(recommendations[0]?.unlocks).toContain("Priorizar cobranza");
  });

  it("recomienda desbloquear seguimientos vencidos o bloqueados", () => {
    const recommendations = buildStrategicRecommendations({
      actions: [
        actionRow("blocked-1", { operational_status: "blocked", priority: "critical" }),
        actionRow("overdue-1", { operational_status: "in_progress", priority: "high" }),
      ],
      feedItems: [],
      narratives: [],
      memorySignals: [],
      now: NOW,
    });

    expect(
      recommendations.some((row) => row.title.includes("Desbloquear seguimientos"))
    ).toBe(true);
  });

  it("recomienda resolver causa raíz ante memoria recurrente", () => {
    const recommendations = buildStrategicRecommendations({
      actions: [],
      feedItems: [],
      narratives: [],
      memorySignals: [memorySignal("memory:recurring:1", { type: "recurring_issue" })],
      now: NOW,
    });

    expect(recommendations.some((row) => row.title.includes("causa raíz"))).toBe(true);
  });

  it("recomienda consolidar mejora tras cierres recientes", () => {
    const recommendations = buildStrategicRecommendations({
      actions: [],
      feedItems: [],
      narratives: [],
      memorySignals: [
        memorySignal("memory:resolved:1", {
          type: "resolved_recently",
          title: "Se cerró una acción relevante hace 2 h",
        }),
      ],
      now: NOW,
    });

    expect(recommendations.some((row) => row.title.includes("Consolidar la mejora"))).toBe(true);
  });

  it("recomienda asignar dueño cuando hay prioridades sin responsable", () => {
    const recommendations = buildStrategicRecommendations({
      actions: [actionRow("unassigned-1", { assigned_to: null, priority: "critical" })],
      feedItems: [],
      narratives: [],
      memorySignals: [
        memorySignal("memory:unassigned", { title: "Prioridad sin responsable" }),
      ],
      now: NOW,
    });

    expect(recommendations.some((row) => row.title.includes("Asignar dueño"))).toBe(true);
  });

  it("devuelve mantenimiento cuando no hay señales críticas", () => {
    const recommendations = buildStrategicRecommendations({
      actions: [actionRow("fresh-1", { due_at: null, priority: "medium", assigned_to: "Ana" })],
      feedItems: [],
      narratives: [],
      memorySignals: [],
      now: NOW,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.unlocks).toContain("Mantener monitoreo");
  });

  it("limita a 3 recomendaciones sin duplicar dedupeKey", () => {
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

    const recommendations = buildStrategicRecommendations(
      {
        actions: [
          actionRow("blocked-1", { operational_status: "blocked", priority: "critical" }),
          actionRow("unassigned-1", { assigned_to: null, priority: "critical" }),
        ],
        feedItems,
        feedGroups,
        narratives: [],
        memorySignals: [memorySignal("memory:recurring:1", { type: "recurring_issue" })],
        treasury: {
          runwayDays: 0,
          riskLevel: "critical",
          upcomingObligationCount: 2,
          criticalAlertCount: 1,
          warningAlertCount: 0,
          hasNegativeProjection: true,
        },
        now: NOW,
      },
      3
    );

    expect(recommendations.length).toBeLessThanOrEqual(3);
    expect(new Set(recommendations.map((row) => row.id)).size).toBe(recommendations.length);
  });

  it("no repite exactamente una narrativa existente", () => {
    const narratives: OperationalNarrative[] = [
      {
        id: "narrative:cash-critical",
        severity: "critical",
        category: "cashflow",
        title: "Caja crítica",
        cause: "Las obligaciones próximas superan la cobertura disponible.",
        impact: "La caja proyectada será negativa en los próximos días.",
        recommendation: "Priorizar cobranza y revisar pagos no críticos.",
        score: 4_000,
      },
    ];

    const recommendations = buildStrategicRecommendations({
      actions: [],
      feedItems: [],
      narratives,
      memorySignals: [],
      treasury: {
        runwayDays: 0,
        riskLevel: "critical",
        upcomingObligationCount: 2,
        criticalAlertCount: 1,
        warningAlertCount: 0,
        hasNegativeProjection: true,
      },
      now: NOW,
    });

    expect(
      recommendations.every(
        (recommendation) =>
          !narratives.some((narrative) => narrative.title === recommendation.title)
      )
    ).toBe(true);
  });
});
