import { describe, expect, it } from "vitest";

import { applyWorkflowMutation, mergeOperationalWorkflows } from "@/lib/copilot-operational-workflows";
import { applyWorkflowCancelLifecycle } from "@/lib/copilot-operational-workflow-lifecycle";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";
import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";
import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";

const NOW = new Date("2026-05-14T12:00:00.000Z");

function emptySnapshot(overrides: Partial<CopilotRutasSnapshot> = {}): CopilotRutasSnapshot {
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

function buildInput(snapshot: CopilotRutasSnapshot, actions: OperationalActionListItem[] = []) {
  return {
    workspaceCompanyId: "ws-1",
    now: NOW,
    snapshot,
    actions,
  };
}

describe("operational workflow lifecycle", () => {
  it("aplica cooldown de 2 horas al cancelar", () => {
    const execution = applyWorkflowCancelLifecycle(
      {
        id: "wf-1",
        workspaceCompanyId: "ws-1",
        templateId: "template:critical_cash",
        type: "critical_cash",
        title: "Caja crítica",
        dedupeKey: "workflow:critical_cash:caja-critica",
        status: "cancelled",
        progressPercent: 0,
        currentStepId: "step-1",
        currentStepTitle: "Paso 1",
        ownerLabel: null,
        nextDueAt: null,
        isOverdue: false,
        steps: [],
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      NOW
    );
    expect(execution.lifecycle?.lastCancelledAt).toBe(NOW.toISOString());
    expect(new Date(execution.lifecycle?.suppressedUntil ?? 0).getTime()).toBe(
      NOW.getTime() + 2 * 60 * 60 * 1000
    );
  });
});

describe("operational workflow reconciliation", () => {
  it("no recrea un workflow cancelado dentro del cooldown", () => {
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
    const input = buildInput(emptySnapshot({ narratives: [narrative] }));
    const first = mergeOperationalWorkflows(input, []);
    const cancelled = applyWorkflowMutation(first.response.workflows[0]!, { action: "cancel" }, NOW);
    const second = mergeOperationalWorkflows(input, [cancelled]);
    expect(second.response.workflows.some((row) => row.type === "critical_cash")).toBe(false);
    expect(second.hasSuppressedWorkflows).toBe(true);
  });

  it("reabre un workflow cancelado fuera del cooldown", () => {
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
    const input = buildInput(emptySnapshot({ narratives: [narrative] }));
    const first = mergeOperationalWorkflows(input, []);
    const cancelled = applyWorkflowMutation(first.response.workflows[0]!, { action: "cancel" }, NOW);
    const cooledDown = applyWorkflowCancelLifecycle(
      { ...cancelled, lifecycle: { ...cancelled.lifecycle, suppressedUntil: "2026-05-14T08:00:00.000Z" } },
      new Date("2026-05-14T08:30:00.000Z")
    );
    const reopened = mergeOperationalWorkflows(
      { ...input, now: new Date("2026-05-14T13:00:00.000Z") },
      [cooledDown]
    );
    expect(reopened.response.workflows.some((row) => row.status === "active")).toBe(true);
  });

  it("auto-completa workflows sin señal justificativa", () => {
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
    const input = buildInput(emptySnapshot({ narratives: [narrative] }));
    const first = mergeOperationalWorkflows(input, []);
    const active = first.response.workflows[0]!;
    const reconciled = mergeOperationalWorkflows(buildInput(emptySnapshot()), [active]);
    expect(reconciled.response.workflows[0]?.status).toBe("completed");
  });

  it("no auto-completa workflows bloqueados", () => {
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
    const input = buildInput(emptySnapshot({ narratives: [narrative] }));
    const first = mergeOperationalWorkflows(input, []);
    const blocked = applyWorkflowMutation(first.response.workflows[0]!, { action: "block" }, NOW);
    const reconciled = mergeOperationalWorkflows(buildInput(emptySnapshot()), [blocked]);
    expect(reconciled.response.workflows[0]?.status).toBe("blocked");
  });
});
