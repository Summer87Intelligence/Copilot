import { describe, expect, it, beforeEach } from "vitest";

import { runOperationalAutomations } from "@/lib/copilot-operational-automation-engine";
import {
  AUTOMATION_KIND_RULE_IDS,
  listOperationalAutomationRules,
} from "@/lib/copilot-operational-automation-registry";
import {
  AUTO_ESCALATION_OPEN_MINUTES,
  evaluateAutoEscalation,
  linkRelatedWorkflows,
} from "@/lib/copilot-operational-automation-rules";
import type { OperationalAutomationInput } from "@/lib/copilot-operational-automation-types";
import {
  buildAutomationGovernanceResponse,
  canApplyAutomationRule,
  getGovernanceContextForWorkspace,
  patchAutomationGovernanceRule,
  resetWorkspaceGovernanceForTests,
} from "@/lib/copilot-operational-governance";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";

const NOW = new Date("2026-05-14T12:00:00.000Z");
const WORKSPACE = "tenant-governance";

function baseWorkflow(
  overrides: Partial<OperationalWorkflowExecution> = {}
): OperationalWorkflowExecution {
  return {
    id: "wf:test",
    workspaceCompanyId: WORKSPACE,
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
    workspaceCompanyId: WORKSPACE,
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
  beforeEach(() => {
    resetWorkspaceGovernanceForTests(WORKSPACE);
  });

  it("escala workflows críticos sin responsable con SLA vencido", () => {
    const escalation = evaluateAutoEscalation(baseWorkflow(), baseInput([baseWorkflow()]));
    expect(escalation?.tags).toContain("needs_attention");
    expect(escalation?.severity).toBe("critical");
    expect(escalation?.explanation.summary).toContain("Escalado");
    expect(escalation?.riskLevel).toBe("supervised");
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
    expect(result.recommendations[0]?.explanation.reasons.length).toBeGreaterThan(0);
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
    expect(result.recommendations[0]?.actionMode).toBe("suggest_only");
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

  it("no genera automation cuando la regla está deshabilitada", () => {
    patchAutomationGovernanceRule(WORKSPACE, AUTOMATION_KIND_RULE_IDS.follow_up, { enabled: false });
    const workflow = baseWorkflow({ lifecycle: { reopenCount: 2 } });
    const result = runOperationalAutomations(baseInput([workflow]));
    expect(result.automations.some((item) => item.kind === "follow_up")).toBe(false);
    expect(
      result.auditEvents?.some(
        (event) =>
          event.ruleId === AUTOMATION_KIND_RULE_IDS.follow_up && event.decision === "skipped_disabled"
      )
    ).toBe(true);
  });

  it("respeta cooldown entre corridas", () => {
    const workflow = baseWorkflow({ lifecycle: { reopenCount: 2 } });
    const first = runOperationalAutomations(baseInput([workflow]));
    expect(first.automations.some((item) => item.kind === "follow_up")).toBe(true);
    const second = runOperationalAutomations(baseInput([workflow]));
    expect(second.automations.some((item) => item.kind === "follow_up")).toBe(false);
    expect(
      second.auditEvents?.some((event) => event.decision === "skipped_cooldown")
    ).toBe(true);
  });
});

describe("copilot-operational-governance", () => {
  beforeEach(() => {
    resetWorkspaceGovernanceForTests(WORKSPACE);
  });

  it("expone el registry completo con defaults habilitados", () => {
    const rules = listOperationalAutomationRules();
    expect(rules.length).toBeGreaterThanOrEqual(6);
    expect(rules.find((rule) => rule.id === AUTOMATION_KIND_RULE_IDS.auto_escalation)?.defaultEnabled).toBe(
      true
    );
    expect(rules.find((rule) => rule.id === "rule.restricted.auto_complete")?.defaultEnabled).toBe(false);
  });

  it("bloquea reglas restringidas aunque estén habilitadas", () => {
    patchAutomationGovernanceRule(WORKSPACE, "rule.restricted.auto_complete", { enabled: true });
    const context = getGovernanceContextForWorkspace(WORKSPACE, NOW);
    const gate = canApplyAutomationRule(context, "rule.restricted.auto_complete", "wf:1");
    expect(gate.allowed).toBe(false);
    expect(gate.decision).toBe("skipped_restricted");
  });

  it("construye respuesta API con reglas y salud", () => {
    const response = buildAutomationGovernanceResponse(WORKSPACE);
    expect(response.rules.length).toBe(listOperationalAutomationRules().length);
    expect(response.health.status).toBe("ok");
    expect(response.generatedAt).toBeTruthy();
  });
});
