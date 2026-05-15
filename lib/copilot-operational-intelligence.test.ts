import { describe, it, expect } from "vitest";
import { buildOperationalIntelligence } from "./copilot-operational-intelligence";
import type { OperationalIntelligenceInput } from "./copilot-operational-intelligence-types";
import type { OperationalWorkflowExecution } from "./copilot-operational-workflows-types";
import type { OperationalAutomationGovernanceResponse } from "./copilot-operational-governance-types";
import type { OperationalAutomationResult } from "./copilot-operational-automation-types";
import type { OperationalTimelineItem } from "./copilot-operational-events-types";

const NOW = new Date("2026-05-15T10:00:00.000Z");

function makeWorkflow(
  id: string,
  overrides: Partial<OperationalWorkflowExecution> = {}
): OperationalWorkflowExecution {
  return {
    id,
    workspaceCompanyId: "ws-1",
    templateId: "tpl-1",
    type: "priority_collections",
    title: `Workflow ${id}`,
    dedupeKey: `key-${id}`,
    status: "active",
    progressPercent: 40,
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

function makeInput(overrides: Partial<OperationalIntelligenceInput> = {}): OperationalIntelligenceInput {
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

function makeCompletedEvent(entityId: string, label: string): OperationalTimelineItem {
  return {
    id: `ev-${entityId}`,
    eventType: "workflow_completed",
    typeLabel: "Workflow completado",
    severity: "success",
    entityType: "workflow",
    entityId,
    entityLabel: label,
    actorLabel: null,
    detail: null,
    occurredAt: NOW.toISOString(),
    href: null,
    contextLabel: null,
  };
}

describe("buildOperationalIntelligence — structure", () => {
  it("returns required fields on empty input", () => {
    const result = buildOperationalIntelligence(makeInput());
    expect(result).toHaveProperty("generatedAt");
    expect(result).toHaveProperty("insights");
    expect(result).toHaveProperty("health");
    expect(Array.isArray(result.insights)).toBe(true);
  });

  it("generatedAt matches input.now", () => {
    const result = buildOperationalIntelligence(makeInput());
    expect(result.generatedAt).toBe(NOW.toISOString());
  });

  it("returns empty insights for empty input", () => {
    const result = buildOperationalIntelligence(makeInput());
    expect(result.insights).toHaveLength(0);
  });
});

describe("Rule 1 — critical cash active", () => {
  it("generates cashflow insight for active critical_cash workflow", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [makeWorkflow("wf-1", { type: "critical_cash", status: "active" })],
      })
    );
    const insight = result.insights.find((i) => i.category === "cashflow");
    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("high");
    expect(insight?.linkedWorkflowIds).toContain("wf-1");
  });

  it("marks severity critical when SLA is breached", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-1", { type: "critical_cash", status: "active", slaStatus: "breached" }),
        ],
      })
    );
    const insight = result.insights.find((i) => i.category === "cashflow");
    expect(insight?.severity).toBe("critical");
  });

  it("does not generate cashflow insight for non-critical workflows", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [makeWorkflow("wf-1", { type: "priority_collections", status: "active" })],
      })
    );
    expect(result.insights.filter((i) => i.category === "cashflow")).toHaveLength(0);
  });

  it("does not generate cashflow insight for completed workflows", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [makeWorkflow("wf-1", { type: "critical_cash", status: "completed" })],
      })
    );
    expect(result.insights.filter((i) => i.category === "cashflow")).toHaveLength(0);
  });

  it("evidence always present for cashflow insight", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [makeWorkflow("wf-1", { type: "critical_cash", status: "active" })],
      })
    );
    const insight = result.insights.find((i) => i.category === "cashflow");
    expect(insight?.evidence.length).toBeGreaterThan(0);
  });
});

describe("Rule 2 — recurring / reopened", () => {
  it("generates execution insight when reopenCount >= 2", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-r", {
            status: "active",
            lifecycle: { reopenCount: 2 },
          }),
        ],
      })
    );
    const insight = result.insights.find((i) => i.id.includes(":recurring:wf-r"));
    expect(insight).toBeDefined();
    expect(insight?.category).toBe("execution");
  });

  it("does not generate recurring insight when reopenCount < 2", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-r", { status: "active", lifecycle: { reopenCount: 1 } }),
        ],
      })
    );
    expect(result.insights.filter((i) => i.id.includes(":recurring:"))).toHaveLength(0);
  });

  it("severity is high when reopenCount >= 4", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-r", { status: "active", lifecycle: { reopenCount: 4 } }),
        ],
      })
    );
    const insight = result.insights.find((i) => i.id.includes(":recurring:wf-r"));
    expect(insight?.severity).toBe("high");
  });

  it("severity is medium when reopenCount between 2-3", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-r", { status: "active", lifecycle: { reopenCount: 3 } }),
        ],
      })
    );
    const insight = result.insights.find((i) => i.id.includes(":recurring:wf-r"));
    expect(insight?.severity).toBe("medium");
  });

  it("picks up recurring_detection automation when no lifecycle data", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        operationalAutomation: {
          ...emptyAutomation(),
          automations: [
            {
              id: "auto-rec",
              kind: "recurring_detection",
              workflowId: "wf-ext",
              title: "Recurrencia detectada",
              summary: "Reabierto con misma clave",
              tags: ["recurrent_issue"],
              severity: "medium",
              ruleId: "rule.recurrence.pattern_detected",
              riskLevel: "safe",
              actionMode: "auto_flag",
              explanation: {
                ruleId: "rule.recurrence.pattern_detected",
                summary: "Misma clave operativa",
                reasons: [],
                evidence: [],
                confidence: "medium",
              },
            },
          ],
        },
      })
    );
    const insight = result.insights.find((i) => i.id.includes("auto:wf-ext"));
    expect(insight).toBeDefined();
    expect(insight?.category).toBe("execution");
  });
});

describe("Rule 3 — SLA breached", () => {
  it("generates execution insight for non-critical SLA breached", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-sla", {
            type: "priority_collections",
            status: "active",
            slaStatus: "breached",
          }),
        ],
      })
    );
    const insight = result.insights.find((i) => i.id.includes(":sla:wf-sla"));
    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("high");
  });

  it("does not generate SLA insight for critical_cash (covered by Rule 1)", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-cc", {
            type: "critical_cash",
            status: "active",
            slaStatus: "breached",
          }),
        ],
      })
    );
    // Should have cashflow insight but NOT a duplicate sla insight
    expect(result.insights.filter((i) => i.id.includes(":sla:"))).toHaveLength(0);
    expect(result.insights.filter((i) => i.category === "cashflow")).toHaveLength(1);
  });

  it("mentions owner in nextBestAction when owner is set", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-sla", {
            type: "priority_collections",
            slaStatus: "breached",
            ownerLabel: "Juan Pérez",
          }),
        ],
      })
    );
    const insight = result.insights.find((i) => i.id.includes(":sla:"));
    expect(insight?.nextBestAction).toContain("Juan Pérez");
  });
});

describe("Rule 4 — governance supervised/restricted", () => {
  function makeGovernedAutomation(id: string, riskLevel: "supervised" | "restricted") {
    return {
      automation: {
        id,
        kind: "auto_escalation" as const,
        workflowId: `wf-${id}`,
        title: `Automatización ${id}`,
        summary: "s",
        tags: ["needs_attention" as const],
        severity: "high" as const,
        ruleId: "rule-x",
        riskLevel,
        actionMode: "requires_confirmation" as const,
        explanation: {
          ruleId: "rule-x",
          summary: "Motivo de retención",
          reasons: [],
          evidence: ["Evidencia X"],
          confidence: "high" as const,
        },
      },
      rule: {
        id: "rule-x",
        name: `Regla ${id}`,
        description: "d",
        category: "sla" as const,
        defaultEnabled: true,
        riskLevel,
        actionMode: "requires_confirmation" as const,
      },
      explanation: {
        ruleId: "rule-x",
        summary: "Motivo de retención",
        reasons: [],
        evidence: ["Evidencia X"],
        confidence: "high" as const,
      },
    };
  }

  it("generates governance insight for supervised automations", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        governance: {
          ...emptyGovernance(),
          activeAutomations: [makeGovernedAutomation("a1", "supervised")],
        },
      })
    );
    expect(result.insights.filter((i) => i.category === "governance")).toHaveLength(1);
    expect(result.insights[0]?.severity).toBe("medium");
  });

  it("severity is high for restricted automations", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        governance: {
          ...emptyGovernance(),
          activeAutomations: [makeGovernedAutomation("a2", "restricted")],
        },
      })
    );
    const insight = result.insights.find((i) => i.category === "governance");
    expect(insight?.severity).toBe("high");
  });

  it("does not generate governance insight for safe automations", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        governance: {
          ...emptyGovernance(),
          activeAutomations: [
            {
              automation: {
                id: "safe-auto",
                kind: "follow_up" as const,
                workflowId: "wf-s",
                title: "Safe",
                summary: "s",
                tags: [],
                severity: "low" as const,
                ruleId: "rule-s",
                riskLevel: "safe" as const,
                actionMode: "suggest_only" as const,
                explanation: {
                  ruleId: "rule-s",
                  summary: "s",
                  reasons: [],
                  evidence: [],
                  confidence: "medium" as const,
                },
              },
              rule: {
                id: "rule-s",
                name: "Safe",
                description: "d",
                category: "resolution" as const,
                defaultEnabled: true,
                riskLevel: "safe" as const,
                actionMode: "suggest_only" as const,
              },
              explanation: {
                ruleId: "rule-s",
                summary: "s",
                reasons: [],
                evidence: [],
                confidence: "medium" as const,
              },
            },
          ],
        },
      })
    );
    expect(result.insights.filter((i) => i.category === "governance")).toHaveLength(0);
  });
});

describe("Rule 5 — recent closures (positive)", () => {
  it("generates operations insight for recent workflow_completed events", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        operationalEvents: [makeCompletedEvent("wf-done", "Cobranza resuelta")],
      })
    );
    const insight = result.insights.find((i) => i.id.includes(":resolved:"));
    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("low");
    expect(insight?.category).toBe("operations");
  });

  it("caps resolved insights at 2", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeCompletedEvent(`wf-done-${i}`, `WF ${i}`)
    );
    const result = buildOperationalIntelligence(makeInput({ operationalEvents: events }));
    const resolvedInsights = result.insights.filter((i) => i.id.includes(":resolved:"));
    expect(resolvedInsights.length).toBeLessThanOrEqual(2);
  });

  it("ignores non-resolution events", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        operationalEvents: [
          {
            id: "ev-block",
            eventType: "workflow_blocked",
            typeLabel: "Bloqueado",
            severity: "warning",
            entityType: "workflow",
            entityId: "wf-b",
            entityLabel: "WF bloqueado",
            actorLabel: null,
            detail: null,
            occurredAt: NOW.toISOString(),
            href: null,
            contextLabel: null,
          },
        ],
      })
    );
    expect(result.insights.filter((i) => i.id.includes(":resolved:"))).toHaveLength(0);
  });
});

describe("MAX_INSIGHTS limit", () => {
  it("caps total insights at 5", () => {
    const workflows = Array.from({ length: 4 }, (_, i) =>
      makeWorkflow(`wf-${i}`, {
        type: "critical_cash",
        status: "active",
        slaStatus: "breached",
        lifecycle: { reopenCount: 3 },
        dedupeKey: `key-${i}`,
      })
    );
    const events = Array.from({ length: 3 }, (_, i) =>
      makeCompletedEvent(`done-${i}`, `Done ${i}`)
    );

    const result = buildOperationalIntelligence(
      makeInput({ workflows, operationalEvents: events })
    );
    expect(result.insights.length).toBeLessThanOrEqual(5);
  });

  it("sorts by severity: critical first", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-high", { type: "priority_collections", slaStatus: "breached" }),
          makeWorkflow("wf-crit", { type: "critical_cash", status: "active", slaStatus: "breached" }),
          makeWorkflow("wf-med", { status: "active", lifecycle: { reopenCount: 3 }, dedupeKey: "k3" }),
        ],
      })
    );
    expect(result.insights[0]?.severity).toBe("critical");
  });
});

describe("confidence", () => {
  it("returns high confidence when health is ok", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [makeWorkflow("wf-1", { type: "critical_cash", status: "active" })],
        snapshotHealth: { status: "ok", warnings: [] },
      })
    );
    expect(result.insights[0]?.confidence).toBe("high");
  });

  it("returns low confidence when health is degraded", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [makeWorkflow("wf-1", { type: "critical_cash", status: "active" })],
        snapshotHealth: { status: "degraded", warnings: [] },
      })
    );
    expect(result.insights[0]?.confidence).toBe("low");
  });

  it("returns medium confidence when health is partial", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [makeWorkflow("wf-1", { type: "critical_cash", status: "active" })],
        snapshotHealth: { status: "partial", warnings: [] },
      })
    );
    expect(result.insights[0]?.confidence).toBe("medium");
  });
});

describe("health derivation", () => {
  it("health ok when snapshot ok", () => {
    const result = buildOperationalIntelligence(makeInput());
    expect(result.health.status).toBe("ok");
  });

  it("health degraded when snapshot degraded", () => {
    const result = buildOperationalIntelligence(
      makeInput({ snapshotHealth: { status: "degraded", warnings: [] } })
    );
    expect(result.health.status).toBe("degraded");
    expect(result.health.warnings.length).toBeGreaterThan(0);
  });

  it("health partial when snapshot stale", () => {
    const result = buildOperationalIntelligence(
      makeInput({ snapshotHealth: { status: "stale", warnings: [] } })
    );
    expect(result.health.status).toBe("partial");
  });
});

describe("topPattern detection", () => {
  it("detects SLA pattern with 2+ breached workflows", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("w1", { type: "priority_collections", slaStatus: "breached" }),
          makeWorkflow("w2", { type: "priority_collections", slaStatus: "breached", dedupeKey: "k2" }),
        ],
      })
    );
    expect(result.topPattern?.title).toContain("SLA");
  });

  it("detects recurring pattern with 2+ reopened workflows", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("w1", { lifecycle: { reopenCount: 3 } }),
          makeWorkflow("w2", { lifecycle: { reopenCount: 2 }, dedupeKey: "k2" }),
        ],
      })
    );
    expect(result.topPattern?.title).toContain("recurrencia");
  });

  it("returns undefined topPattern when no dominant pattern", () => {
    const result = buildOperationalIntelligence(makeInput());
    expect(result.topPattern).toBeUndefined();
  });
});

describe("deduplication", () => {
  it("does not generate duplicate insights for the same workflow + category", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("wf-dup", { type: "critical_cash", status: "active" }),
          makeWorkflow("wf-dup", { type: "critical_cash", status: "active" }),
        ],
      })
    );
    const cashflowInsights = result.insights.filter((i) => i.category === "cashflow");
    expect(cashflowInsights.length).toBe(1);
  });
});

describe("evidence invariant", () => {
  it("every insight has at least one evidence item", () => {
    const result = buildOperationalIntelligence(
      makeInput({
        workflows: [
          makeWorkflow("w1", { type: "critical_cash", status: "active" }),
          makeWorkflow("w2", { type: "priority_collections", slaStatus: "breached", dedupeKey: "k2" }),
          makeWorkflow("w3", { status: "active", lifecycle: { reopenCount: 3 }, dedupeKey: "k3" }),
        ],
        operationalEvents: [makeCompletedEvent("ev-done", "Hecho")],
      })
    );
    for (const insight of result.insights) {
      expect(insight.evidence.length).toBeGreaterThan(0);
    }
  });
});
