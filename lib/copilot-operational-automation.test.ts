import { describe, expect, it } from "vitest";

import { runOperationalAutomations } from "@/lib/copilot-operational-automation-engine";
import {
  AUTO_ESCALATION_OPEN_MINUTES,
  evaluateAutoEscalation,
  linkRelatedWorkflows,
} from "@/lib/copilot-operational-automation-rules";
import type { OperationalAutomationInput } from "@/lib/copilot-operational-automation-types";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";

const NOW = new Date("2026-05-14T12:00:00.000Z");

function baseWorkflow(
  overrides: Partial<OperationalWorkflowExecution> = {}
): OperationalWorkflowExecution {
  return {
    id: "wf:test",
    workspaceCompanyId: "tenant-1",
    templateId: "template:critical_cash",
    type: "critical_cash",
    title: "Caja crítica",
    dedupeKey: "cash:1",
    status: "active",
    progressPercent: 10,
    currentStepId: "step-1",
    currentStepTitle: "Revisar caja",
    ownerLabel: null,
    assignedUserId: null,
    nextDueAt: null,
    isOverdue: true,
    slaStatus: "breached",
    slaDueAt: "2026-05-14T10:00:00.000Z",
    urgencyScore: 85,
    lifecycle: { reopenCount: 0 },
    steps: [],
    createdAt: new Date(NOW.getTime() - (AUTO_ESCALATION_OPEN_MINUTES + 5) * 60_000).toISOString(),
    updatedAt: NOW.toISOString(),
    relatedActionIds: ["act-1"],
    ...overrides,
  };
}

function baseInput(
  workflows: OperationalWorkflowExecution[],
  overrides: Partial<OperationalAutomationInput> = {}
): OperationalAutomationInput {
  return {
    workspaceCompanyId: "tenant-1",
    now: NOW,
    snapshot: {
      generatedAt: NOW.toISOString(),
      feed: { items: [], groups: [], priorities: [] },
      memory: [],
      narratives: [],
      recommendations: [],
    },
    workflows,
    actions: [],
    events: [],
    memorySignals: [],
    ...overrides,
  };
}

describe("copilot-operational-automation", () => {
  it("escala workflows críticos sin responsable con SLA vencido", () => {
    const escalation = evaluateAutoEscalation(baseWorkflow(), baseInput([baseWorkflow()]));
    expect(escalation?.tags).toContain("needs_attention");
    expect(escalation?.severity).toBe("critical");
  });

  it("recomienda follow-up y detecta recurrencia tras reaperturas", () => {
    const workflow = baseWorkflow({
      id: "wf:recurrent",
      lifecycle: { reopenCount: 2 },
    });
    const result = runOperationalAutomations(baseInput([workflow]));
    expect(result.recommendations.some((item) => item.code === "follow_up_recommended")).toBe(true);
    expect(result.automations.some((item) => item.kind === "recurring_detection")).toBe(true);
    expect(result.eventDrafts.some((item) => item.eventType === "workflow_followup_recommended")).toBe(
      true
    );
  });

  it("vincula workflows relacionados por acciones compartidas", () => {
    const left = baseWorkflow({ id: "wf:left", relatedActionIds: ["act-shared"] });
    const right = baseWorkflow({
      id: "wf:right",
      type: "priority_collections",
      title: "Cobranzas vencidas",
      dedupeKey: "collections:1",
      relatedActionIds: ["act-shared"],
    });
    const links = linkRelatedWorkflows([left, right]);
    expect(links.get("wf:left")).toEqual(["wf:right"]);
    expect(links.get("wf:right")).toEqual(["wf:left"]);
  });

  it("sugiere cierre cuando la señal ya no justifica el workflow", () => {
    const workflow = baseWorkflow({
      id: "wf:stale",
      type: "blocked_followup",
      title: "Seguimiento bloqueado",
      dedupeKey: "blocked:1",
      slaStatus: "healthy",
      isOverdue: false,
    });
    const result = runOperationalAutomations(baseInput([workflow]));
    expect(result.recommendations.some((item) => item.code === "workflow_can_be_completed")).toBe(true);
  });

  it("no duplica automations ni event drafts en la misma corrida", () => {
    const workflow = baseWorkflow({
      lifecycle: { reopenCount: 3 },
    });
    const result = runOperationalAutomations(baseInput([workflow]));
    const automationIds = result.automations.map((item) => item.id);
    const draftKeys = result.eventDrafts.map(
      (item) => `${item.eventType}:${item.workflow.id}:${item.detail ?? ""}`
    );
    expect(new Set(automationIds).size).toBe(automationIds.length);
    expect(new Set(draftKeys).size).toBe(draftKeys.length);
  });
});
