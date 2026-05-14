import { describe, expect, it } from "vitest";

import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";
import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";
import type { StrategicRecommendation } from "@/lib/copilot-strategic-recommendations-types";
import {
  applyWorkflowMutation,
  computeWorkflowProgressPercent,
  mergeOperationalWorkflows,
  recomputeWorkflowExecution,
} from "@/lib/copilot-operational-workflows";
import { getOperationalWorkflowTemplate } from "@/lib/copilot-operational-workflows-templates";

const NOW = new Date("2026-05-14T12:00:00.000Z");

function emptySnapshot(
  overrides: Partial<CopilotRutasSnapshot> = {}
): CopilotRutasSnapshot {
  return {
    generatedAt: NOW.toISOString(),
    feed: { items: [], groups: [], priorities: [] },
    timeline: [],
    memory: [],
    narratives: [],
    recommendations: [],
    counts: {
      feedItems: 0,
      groups: 0,
      memorySignals: 0,
      narratives: 0,
      recommendations: 0,
      timelineEvents: 0,
    },
    health: { status: "ok", warnings: [] },
    ...overrides,
  };
}

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
    assigned_to: null,
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

describe("operational workflow templates", () => {
  it("define cinco pasos por plantilla inicial", () => {
    expect(getOperationalWorkflowTemplate("critical_cash").steps).toHaveLength(5);
    expect(getOperationalWorkflowTemplate("priority_collections").steps[0]?.title).toContain(
      "Identificar deuda principal"
    );
    expect(getOperationalWorkflowTemplate("blocked_followup").steps[4]?.title).toContain(
      "Retomar ejecución"
    );
  });
});

describe("operational workflow progress", () => {
  it("calcula porcentaje y activa el siguiente paso al completar", () => {
    const narrative: OperationalNarrative = {
      id: "narrative:cash-critical",
      severity: "critical",
      category: "cashflow",
      title: "Caja crítica",
      cause: "Causa",
      impact: "Impacto",
      recommendation: "Acción",
      score: 4_000,
    };
    const { response } = mergeOperationalWorkflows(
      {
        workspaceCompanyId: "ws-1",
        now: NOW,
        snapshot: emptySnapshot({ narratives: [narrative] }),
        actions: [],
      },
      []
    );
    const workflow = response.workflows[0];
    expect(workflow?.type).toBe("critical_cash");
    expect(workflow?.progressPercent).toBe(0);

    const completedFirst = applyWorkflowMutation(
      workflow!,
      { action: "complete_step", stepId: workflow!.steps[0]?.stepId },
      NOW
    );
    expect(computeWorkflowProgressPercent(completedFirst.steps)).toBe(20);
    expect(completedFirst.currentStepTitle).toBe("Contactar clientes prioritarios");
  });

  it("bloquea workflow cuando un paso queda bloqueado", () => {
    const memory: OperationalMemorySignal = {
      id: "memory:recurring:1",
      type: "recurring_issue",
      severity: "high",
      title: "Riesgo recurrente",
      summary: "Se repite",
      evidence: [],
      score: 3_000,
    };
    const { response } = mergeOperationalWorkflows(
      {
        workspaceCompanyId: "ws-1",
        now: NOW,
        snapshot: emptySnapshot({ memory: [memory] }),
        actions: [],
      },
      []
    );
    const workflow = response.workflows[0];
    const blocked = applyWorkflowMutation(
      workflow!,
      { action: "block_step", stepId: workflow!.currentStepId ?? undefined },
      NOW
    );
    expect(blocked.status).toBe("blocked");
    expect(recomputeWorkflowExecution(blocked, NOW).status).toBe("blocked");
  });
});

describe("operational workflow dedupe", () => {
  it("no crea múltiples workflows activos con la misma dedupeKey", () => {
    const narrative: OperationalNarrative = {
      id: "narrative:cash-critical",
      severity: "critical",
      category: "cashflow",
      title: "Caja crítica",
      cause: "Causa",
      impact: "Impacto",
      recommendation: "Acción",
      score: 4_000,
    };
    const recommendation: StrategicRecommendation = {
      id: "strategic:cash-critical",
      priority: "critical",
      category: "cashflow",
      title: "Priorizar cobranza",
      rationale: "Racional",
      expectedImpact: "Impacto",
      unlocks: "Desbloquea",
      timeframe: "today",
      score: 4_500,
    };
    const input = {
      workspaceCompanyId: "ws-1",
      now: NOW,
      snapshot: emptySnapshot({ narratives: [narrative], recommendations: [recommendation] }),
      actions: [],
    };
    const first = mergeOperationalWorkflows(input, []);
    const second = mergeOperationalWorkflows(input, first.response.workflows);
    expect(first.stats.generated).toBe(1);
    expect(second.stats.deduped).toBeGreaterThan(0);
    expect(second.response.workflows.filter((row) => row.type === "critical_cash")).toHaveLength(1);
  });

  it("genera seguimiento bloqueado ante acciones bloqueadas", () => {
    const { response } = mergeOperationalWorkflows(
      {
        workspaceCompanyId: "ws-1",
        now: NOW,
        snapshot: emptySnapshot(),
        actions: [actionRow("blocked-1", { operational_status: "blocked" })],
      },
      []
    );
    expect(response.workflows.some((row) => row.type === "blocked_followup")).toBe(true);
  });
});

describe("operational workflow snapshot compatibility", () => {
  it("usa narrativas, recomendaciones y memoria del snapshot sin mutarlo", () => {
    const snapshot = emptySnapshot({
      narratives: [
        {
          id: "narrative:collections",
          severity: "high",
          category: "collections",
          title: "Cobranza prioritaria",
          cause: "Causa",
          impact: "Impacto",
          recommendation: "Acción",
          score: 2_000,
        },
      ],
    });
    const before = structuredClone(snapshot);
    const { response } = mergeOperationalWorkflows(
      {
        workspaceCompanyId: "ws-1",
        now: NOW,
        snapshot,
        actions: [],
      },
      []
    );
    expect(snapshot).toEqual(before);
    expect(response.workflows.some((row) => row.type === "priority_collections")).toBe(true);
  });
});
