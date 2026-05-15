import { describe, it, expect } from "vitest";
import { buildExecutiveBriefing } from "./copilot-executive-briefing";
import type { ExecutiveBriefingInput } from "./copilot-executive-briefing-types";
import type { OperationalWorkflowExecution } from "./copilot-operational-workflows-types";
import type { OperationalAutomationGovernanceResponse } from "./copilot-operational-governance-types";
import type { OperationalAutomationResult } from "./copilot-operational-automation-types";

const NOW = new Date("2026-05-14T12:00:00.000Z");

function makeWorkflow(
  overrides: Partial<OperationalWorkflowExecution> = {}
): OperationalWorkflowExecution {
  return {
    id: "wf-1",
    workspaceCompanyId: "ws-1",
    templateId: "tpl-1",
    type: "priority_collections",
    title: "Cobranza pendiente",
    dedupeKey: "wf:cobranza",
    status: "active",
    progressPercent: 30,
    currentStepId: null,
    currentStepTitle: null,
    ownerLabel: null,
    nextDueAt: null,
    isOverdue: false,
    slaStatus: "healthy",
    steps: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function emptyGovernance(): OperationalAutomationGovernanceResponse {
  return {
    rules: [],
    activeAutomations: [],
    auditEvents: [],
    generatedAt: NOW.toISOString(),
    health: { status: "ok", warnings: [] },
  };
}

function emptyAutomation(): OperationalAutomationResult {
  return {
    automations: [],
    escalations: [],
    recommendations: [],
    memoryDerived: {},
    computedAt: NOW.toISOString(),
  };
}

function makeInput(overrides: Partial<ExecutiveBriefingInput> = {}): ExecutiveBriefingInput {
  return {
    now: NOW,
    workflows: [],
    operationalEvents: [],
    memorySignals: [],
    operationalAutomation: emptyAutomation(),
    governance: emptyGovernance(),
    snapshotHealth: { status: "ok", warnings: [] },
    ...overrides,
  };
}

describe("buildExecutiveBriefing — status", () => {
  it("returns stable when no workflows", () => {
    const briefing = buildExecutiveBriefing(makeInput());
    expect(briefing.status).toBe("stable");
  });

  it("returns critical when critical_cash workflow is SLA breached", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        workflows: [
          makeWorkflow({ type: "critical_cash", status: "active", slaStatus: "breached" }),
        ],
      })
    );
    expect(briefing.status).toBe("critical");
  });

  it("returns critical when critical_cash workflow is blocked", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        workflows: [
          makeWorkflow({ type: "critical_cash", status: "blocked", slaStatus: "healthy" }),
        ],
      })
    );
    expect(briefing.status).toBe("critical");
  });

  it("returns critical when snapshotHealth is degraded", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ snapshotHealth: { status: "degraded", warnings: [] } })
    );
    expect(briefing.status).toBe("critical");
  });

  it("returns warning when a workflow has SLA warning", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        workflows: [makeWorkflow({ slaStatus: "warning" })],
      })
    );
    expect(briefing.status).toBe("warning");
  });

  it("returns warning when a workflow is overdue", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ workflows: [makeWorkflow({ isOverdue: true })] })
    );
    expect(briefing.status).toBe("warning");
  });

  it("returns warning when snapshotHealth is partial", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ snapshotHealth: { status: "partial", warnings: [] } })
    );
    expect(briefing.status).toBe("warning");
  });
});

describe("buildExecutiveBriefing — headline rules", () => {
  it("uses blocked/breached headline when critical_cash is blocked", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        workflows: [makeWorkflow({ type: "critical_cash", status: "blocked" })],
      })
    );
    expect(briefing.headline).toBe("Hay bloqueos operativos que requieren atención.");
  });

  it("uses blocked/breached headline when critical_cash is SLA breached", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        workflows: [
          makeWorkflow({ type: "critical_cash", status: "active", slaStatus: "breached" }),
        ],
      })
    );
    expect(briefing.headline).toBe("Hay bloqueos operativos que requieren atención.");
  });

  it("uses cash pressure headline when critical_cash is active (no block/breach)", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        workflows: [makeWorkflow({ type: "critical_cash", status: "active" })],
      })
    );
    expect(briefing.headline).toBe("La presión de caja sigue siendo la prioridad principal.");
  });

  it("uses warning headline when no critical_cash but warning status", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ workflows: [makeWorkflow({ slaStatus: "warning" })] })
    );
    expect(briefing.headline).toBe("Hay señales que requieren seguimiento.");
  });

  it("uses normal headline when stable", () => {
    const briefing = buildExecutiveBriefing(makeInput());
    expect(briefing.headline).toBe("Operación en estado normal.");
  });
});

describe("buildExecutiveBriefing — doFirst limits", () => {
  it("caps doFirst at 3", () => {
    const workflows = Array.from({ length: 6 }, (_, i) =>
      makeWorkflow({
        id: `wf-${i}`,
        type: "critical_cash",
        status: "blocked",
        title: `Workflow ${i}`,
        dedupeKey: `key-${i}`,
      })
    );
    const briefing = buildExecutiveBriefing(makeInput({ workflows }));
    expect(briefing.doFirst.length).toBeLessThanOrEqual(3);
  });

  it("includes critical_cash blocked workflows in doFirst", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        workflows: [
          makeWorkflow({ id: "wf-a", type: "critical_cash", status: "blocked", title: "Caja A" }),
        ],
      })
    );
    expect(briefing.doFirst[0]?.title).toBe("Caja A");
    expect(briefing.doFirst[0]?.actionLabel).toBe("Desbloquear");
  });
});

describe("buildExecutiveBriefing — needsApproval", () => {
  it("includes supervised governance automations in needsApproval", () => {
    const governance: OperationalAutomationGovernanceResponse = {
      rules: [],
      activeAutomations: [
        {
          automation: {
            id: "auto-1",
            kind: "auto_escalation",
            workflowId: "wf-1",
            title: "Escalación supervisada",
            summary: "Escalar por SLA",
            tags: ["needs_attention"],
            severity: "high",
            ruleId: "rule-1",
            riskLevel: "supervised",
            actionMode: "requires_confirmation",
            explanation: {
              ruleId: "rule-1",
              summary: "Razón de supervisión",
              reasons: [],
              evidence: [],
              confidence: "high",
            },
          },
          rule: {
            id: "rule-1",
            name: "Regla supervisada",
            description: "Descripción",
            category: "sla",
            defaultEnabled: true,
            riskLevel: "supervised",
            actionMode: "requires_confirmation",
          },
          explanation: {
            ruleId: "rule-1",
            summary: "Razón de supervisión",
            reasons: [],
            evidence: [],
            confidence: "high",
          },
        },
      ],
      auditEvents: [],
      generatedAt: NOW.toISOString(),
      health: { status: "ok", warnings: [] },
    };

    const briefing = buildExecutiveBriefing(makeInput({ governance }));
    expect(briefing.needsApproval).toHaveLength(1);
    expect(briefing.needsApproval[0]?.riskLevel).toBe("supervised");
    expect(briefing.needsApproval[0]?.title).toBe("Escalación supervisada");
  });

  it("caps needsApproval at 3", () => {
    const makeGA = (i: number) => ({
      automation: {
        id: `auto-${i}`,
        kind: "auto_escalation" as const,
        workflowId: `wf-${i}`,
        title: `Auto ${i}`,
        summary: "sum",
        tags: ["needs_attention" as const],
        severity: "high" as const,
        ruleId: `rule-${i}`,
        riskLevel: "supervised" as const,
        actionMode: "requires_confirmation" as const,
        explanation: {
          ruleId: `rule-${i}`,
          summary: "s",
          reasons: [],
          evidence: [],
          confidence: "high" as const,
        },
      },
      rule: {
        id: `rule-${i}`,
        name: `Regla ${i}`,
        description: "d",
        category: "sla" as const,
        defaultEnabled: true,
        riskLevel: "supervised" as const,
        actionMode: "requires_confirmation" as const,
      },
      explanation: {
        ruleId: `rule-${i}`,
        summary: "s",
        reasons: [],
        evidence: [],
        confidence: "high" as const,
      },
    });

    const governance: OperationalAutomationGovernanceResponse = {
      rules: [],
      activeAutomations: [makeGA(1), makeGA(2), makeGA(3), makeGA(4), makeGA(5)],
      auditEvents: [],
      generatedAt: NOW.toISOString(),
      health: { status: "ok", warnings: [] },
    };

    const briefing = buildExecutiveBriefing(makeInput({ governance }));
    expect(briefing.needsApproval.length).toBeLessThanOrEqual(3);
  });

  it("excludes safe governance automations from needsApproval", () => {
    const governance: OperationalAutomationGovernanceResponse = {
      rules: [],
      activeAutomations: [
        {
          automation: {
            id: "auto-safe",
            kind: "follow_up",
            workflowId: "wf-1",
            title: "Automatización segura",
            summary: "s",
            tags: [],
            severity: "low",
            ruleId: "rule-safe",
            riskLevel: "safe",
            actionMode: "suggest_only",
            explanation: {
              ruleId: "rule-safe",
              summary: "s",
              reasons: [],
              evidence: [],
              confidence: "medium",
            },
          },
          rule: {
            id: "rule-safe",
            name: "Segura",
            description: "d",
            category: "resolution",
            defaultEnabled: true,
            riskLevel: "safe",
            actionMode: "suggest_only",
          },
          explanation: {
            ruleId: "rule-safe",
            summary: "s",
            reasons: [],
            evidence: [],
            confidence: "medium",
          },
        },
      ],
      auditEvents: [],
      generatedAt: NOW.toISOString(),
      health: { status: "ok", warnings: [] },
    };

    const briefing = buildExecutiveBriefing(makeInput({ governance }));
    expect(briefing.needsApproval).toHaveLength(0);
  });
});

describe("buildExecutiveBriefing — resolvedRecently", () => {
  it("picks up workflow_completed events", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        operationalEvents: [
          {
            id: "ev-1",
            eventType: "workflow_completed",
            typeLabel: "Completado",
            severity: "success",
            entityType: "workflow",
            entityId: "wf-1",
            entityLabel: "Workflow completado",
            actorLabel: null,
            detail: null,
            occurredAt: NOW.toISOString(),
            href: null,
            contextLabel: null,
          },
        ],
      })
    );
    expect(briefing.resolvedRecently).toHaveLength(1);
    expect(briefing.resolvedRecently[0]).toContain("resuelto");
  });

  it("caps resolvedRecently at 3", () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      id: `ev-${i}`,
      eventType: "workflow_completed" as const,
      typeLabel: "Completado",
      severity: "success" as const,
      entityType: "workflow" as const,
      entityId: `wf-${i}`,
      entityLabel: `WF ${i}`,
      actorLabel: null,
      detail: null,
      occurredAt: NOW.toISOString(),
      href: null,
      contextLabel: null,
    }));

    const briefing = buildExecutiveBriefing(makeInput({ operationalEvents: events }));
    expect(briefing.resolvedRecently.length).toBeLessThanOrEqual(3);
  });
});

describe("buildExecutiveBriefing — risksIncreasing", () => {
  it("includes SLA warning workflows", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ workflows: [makeWorkflow({ slaStatus: "warning" })] })
    );
    expect(briefing.risksIncreasing.some((r) => r.includes("SLA"))).toBe(true);
  });

  it("caps risksIncreasing at 3", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        workflows: [
          makeWorkflow({ id: "w1", slaStatus: "warning", dedupeKey: "k1" }),
          makeWorkflow({ id: "w2", status: "blocked", dedupeKey: "k2", ownerLabel: null }),
        ],
        memorySignals: [
          {
            id: "sig-1",
            type: "open_too_long",
            severity: "high",
            title: "Abierta mucho tiempo",
            summary: "s",
            evidence: [],
            score: 70,
          },
        ],
        operationalAutomation: {
          ...emptyAutomation(),
          automations: [
            {
              id: "auto-r",
              kind: "recurring_detection",
              workflowId: "wf-1",
              title: "Patrón",
              summary: "s",
              tags: ["recurrent_issue"],
              severity: "medium",
              ruleId: "r1",
              riskLevel: "safe",
              actionMode: "auto_flag",
              explanation: {
                ruleId: "r1",
                summary: "s",
                reasons: [],
                evidence: [],
                confidence: "medium",
              },
            },
          ],
        },
      })
    );
    expect(briefing.risksIncreasing.length).toBeLessThanOrEqual(3);
  });
});

describe("buildExecutiveBriefing — confidence", () => {
  it("returns high when health is ok", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ snapshotHealth: { status: "ok", warnings: [] } })
    );
    expect(briefing.confidence).toBe("high");
  });

  it("returns medium when health is partial", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ snapshotHealth: { status: "partial", warnings: [] } })
    );
    expect(briefing.confidence).toBe("medium");
  });

  it("returns low when health is degraded", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ snapshotHealth: { status: "degraded", warnings: [] } })
    );
    expect(briefing.confidence).toBe("low");
  });

  it("returns high when snapshotHealth is null", () => {
    const briefing = buildExecutiveBriefing(makeInput({ snapshotHealth: null }));
    expect(briefing.confidence).toBe("high");
  });
});

describe("buildExecutiveBriefing — evidence", () => {
  it("includes open workflow count", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({ workflows: [makeWorkflow({ status: "active" })] })
    );
    expect(briefing.evidence.some((e) => e.includes("workflow"))).toBe(true);
  });

  it("includes escalation count when present", () => {
    const briefing = buildExecutiveBriefing(
      makeInput({
        operationalAutomation: {
          ...emptyAutomation(),
          escalations: [
            {
              id: "esc-1",
              workflowId: "wf-1",
              title: "Escalación",
              detail: "detalle",
              severity: "critical",
              tags: ["needs_attention"],
              urgencyDelta: 20,
              ruleId: "r1",
              riskLevel: "safe",
              actionMode: "auto_flag",
              explanation: {
                ruleId: "r1",
                summary: "s",
                reasons: [],
                evidence: [],
                confidence: "high",
              },
            },
          ],
        },
      })
    );
    expect(briefing.evidence.some((e) => e.includes("escalación"))).toBe(true);
  });
});

describe("buildExecutiveBriefing — structure", () => {
  it("always returns all required fields", () => {
    const briefing = buildExecutiveBriefing(makeInput());
    expect(briefing).toHaveProperty("generatedAt");
    expect(briefing).toHaveProperty("status");
    expect(briefing).toHaveProperty("headline");
    expect(briefing).toHaveProperty("summary");
    expect(briefing).toHaveProperty("whatChanged");
    expect(briefing).toHaveProperty("whyItMatters");
    expect(briefing).toHaveProperty("doFirst");
    expect(briefing).toHaveProperty("needsApproval");
    expect(briefing).toHaveProperty("resolvedRecently");
    expect(briefing).toHaveProperty("risksIncreasing");
    expect(briefing).toHaveProperty("confidence");
    expect(briefing).toHaveProperty("evidence");
    expect(Array.isArray(briefing.doFirst)).toBe(true);
    expect(Array.isArray(briefing.needsApproval)).toBe(true);
    expect(Array.isArray(briefing.resolvedRecently)).toBe(true);
    expect(Array.isArray(briefing.risksIncreasing)).toBe(true);
  });

  it("generatedAt matches input.now", () => {
    const briefing = buildExecutiveBriefing(makeInput());
    expect(briefing.generatedAt).toBe(NOW.toISOString());
  });
});
