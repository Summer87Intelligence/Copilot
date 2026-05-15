import { describe, it, expect } from "vitest";
import { buildCopilotIntelligenceBundle } from "./copilot-intelligence-bundle";
import type { IntelligenceBundleInput } from "./copilot-intelligence-bundle-types";
import type { CopilotRutasSnapshot } from "./copilot-rutas-snapshot-types";
import type { OperationalWorkflowExecution } from "./copilot-operational-workflows-types";
import type { OperationalAutomationGovernanceResponse } from "./copilot-operational-governance-types";
import type { OperationalAutomationResult } from "./copilot-operational-automation-types";
import type { RebuildHealthSummary } from "./copilot-operational-telemetry";

const NOW = new Date("2026-05-15T12:00:00.000Z");

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

function emptySnapshot(): CopilotRutasSnapshot {
  return {
    generatedAt: NOW.toISOString(),
    feed: { items: [], groups: [], priorities: [] },
    timeline: [],
    memory: [],
    narratives: [],
    recommendations: [],
    counts: { feedItems: 0, groups: 0, memorySignals: 0, narratives: 0, recommendations: 0, timelineEvents: 0 },
    health: { status: "ok", warnings: [] },
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

function emptyRebuildHealth(): RebuildHealthSummary {
  return {
    workspaceCompanyId: "ws-1",
    rebuildCount: 0,
    avgDurationMs: 0,
    lastDurationMs: 0,
    degradedCount: 0,
    lastWorkflowCount: 0,
    lastAutomationCount: 0,
    lastTimestamp: null,
  };
}

function makeInput(overrides: Partial<IntelligenceBundleInput> = {}): IntelligenceBundleInput {
  return {
    now: NOW,
    snapshot: emptySnapshot(),
    workflows: [],
    operationalAutomation: emptyAutomation(),
    events: [],
    governance: emptyGovernance(),
    health: {
      snapshot: { status: "ok", warnings: [] },
      rebuild: emptyRebuildHealth(),
    },
    currentUser: { id: "user-1", label: "Test User" },
    timingMs: {},
    warnings: [],
    ...overrides,
  };
}

describe("buildCopilotIntelligenceBundle — structure", () => {
  it("returns all required top-level fields", () => {
    const bundle = buildCopilotIntelligenceBundle(makeInput());
    expect(bundle).toHaveProperty("generatedAt");
    expect(bundle).toHaveProperty("snapshot");
    expect(bundle).toHaveProperty("workflows");
    expect(bundle).toHaveProperty("operationalAutomation");
    expect(bundle).toHaveProperty("events");
    expect(bundle).toHaveProperty("governance");
    expect(bundle).toHaveProperty("health");
    expect(bundle).toHaveProperty("executiveBriefing");
    expect(bundle).toHaveProperty("operationalIntelligence");
    expect(bundle).toHaveProperty("commandCenter");
    expect(bundle).toHaveProperty("warnings");
    expect(bundle).toHaveProperty("timingMs");
  });

  it("generatedAt matches input.now", () => {
    const bundle = buildCopilotIntelligenceBundle(makeInput());
    expect(bundle.generatedAt).toBe(NOW.toISOString());
  });
});

describe("buildCopilotIntelligenceBundle — single build pass", () => {
  it("briefing and intelligence receive the same workflow set", () => {
    const workflows = [
      makeWorkflow("wf-1", { type: "critical_cash", status: "active", slaStatus: "breached", isOverdue: true }),
      makeWorkflow("wf-2", { status: "blocked" }),
    ];
    const bundle = buildCopilotIntelligenceBundle(makeInput({ workflows }));

    // Briefing doFirst lists SLA-breached critical_cash; intelligence links them as cashflow insights
    const briefingWorkflowTitles = bundle.executiveBriefing.doFirst.map((d) => d.title);
    const intelligenceLinkedIds = bundle.operationalIntelligence.insights.flatMap(
      (i) => i.linkedWorkflowIds
    );

    // SLA-breached critical_cash workflow should appear in both layers
    expect(briefingWorkflowTitles.some((t) => t.includes("Workflow wf-1"))).toBe(true);
    expect(intelligenceLinkedIds).toContain("wf-1");
  });

  it("command center items are built from the same feed items as the snapshot", () => {
    // With empty feed items the command center items come from workflows
    const workflows = [makeWorkflow("wf-cc", { type: "critical_cash", status: "active" })];
    const bundle = buildCopilotIntelligenceBundle(makeInput({ workflows }));
    // CommandCenter should have at least the critical cash workflow as an item
    expect(bundle.commandCenter.items.length).toBeGreaterThanOrEqual(1);
  });

  it("command center filters contains all expected values", () => {
    const bundle = buildCopilotIntelligenceBundle(makeInput());
    expect(bundle.commandCenter.filters).toContain("all");
    expect(bundle.commandCenter.filters).toContain("critical");
    expect(bundle.commandCenter.filters).toContain("blocked");
    expect(bundle.commandCenter.filters).toContain("mine");
  });
});

describe("buildCopilotIntelligenceBundle — timingMs", () => {
  it("populates briefing timing", () => {
    const bundle = buildCopilotIntelligenceBundle(makeInput());
    expect(typeof bundle.timingMs.briefing).toBe("number");
  });

  it("populates intelligence timing", () => {
    const bundle = buildCopilotIntelligenceBundle(makeInput());
    expect(typeof bundle.timingMs.intelligence).toBe("number");
  });

  it("populates commandCenter timing", () => {
    const bundle = buildCopilotIntelligenceBundle(makeInput());
    expect(typeof bundle.timingMs.commandCenter).toBe("number");
  });

  it("populates derivations and total", () => {
    const bundle = buildCopilotIntelligenceBundle(makeInput());
    expect(typeof bundle.timingMs.derivations).toBe("number");
    expect(typeof bundle.timingMs.total).toBe("number");
  });

  it("passes through caller-provided stage timings", () => {
    const bundle = buildCopilotIntelligenceBundle(
      makeInput({
        timingMs: { snapshot: 50, actions: 30, events: 20, workflows: 200 },
      })
    );
    expect(bundle.timingMs.snapshot).toBe(50);
    expect(bundle.timingMs.workflows).toBe(200);
  });
});

describe("buildCopilotIntelligenceBundle — warnings", () => {
  it("passes through caller warnings unchanged", () => {
    const bundle = buildCopilotIntelligenceBundle(
      makeInput({ warnings: ["snapshot parcial"] })
    );
    expect(bundle.warnings).toContain("snapshot parcial");
  });

  it("adds slow-bundle warning when total exceeds threshold", () => {
    // Simulate a very long workflow build time (caller-provided)
    const bundle = buildCopilotIntelligenceBundle(
      makeInput({
        timingMs: { snapshot: 500, actions: 400, events: 300, workflows: 600 },
      })
    );
    // 500+400+300+600 = 1800 > 1500
    const hasSlowWarning = bundle.warnings.some((w) => w.includes("Bundle lento"));
    expect(hasSlowWarning).toBe(true);
  });

  it("does not add slow-bundle warning when under threshold", () => {
    const bundle = buildCopilotIntelligenceBundle(
      makeInput({
        timingMs: { snapshot: 50, actions: 20, events: 30, workflows: 100 },
      })
    );
    const hasSlowWarning = bundle.warnings.some((w) => w.includes("Bundle lento"));
    expect(hasSlowWarning).toBe(false);
  });
});

describe("buildCopilotIntelligenceBundle — partial failure resilience", () => {
  it("does not throw when automation is null", () => {
    expect(() =>
      buildCopilotIntelligenceBundle(makeInput({ operationalAutomation: null }))
    ).not.toThrow();
  });

  it("does not throw with empty workflows", () => {
    expect(() => buildCopilotIntelligenceBundle(makeInput({ workflows: [] }))).not.toThrow();
  });

  it("preserves health data in the bundle", () => {
    const health = {
      snapshot: { status: "partial" as const, warnings: [{ source: "memory", code: "PARTIAL", message: "Partial" }] },
      rebuild: emptyRebuildHealth(),
    };
    const bundle = buildCopilotIntelligenceBundle(makeInput({ health }));
    expect(bundle.health.snapshot.status).toBe("partial");
  });

  it("returns degraded-confidence insights when snapshot health is degraded", () => {
    const bundle = buildCopilotIntelligenceBundle(
      makeInput({
        snapshot: { ...emptySnapshot(), health: { status: "degraded", warnings: [] } },
        workflows: [makeWorkflow("w1", { type: "critical_cash", status: "active" })],
      })
    );
    const cashInsight = bundle.operationalIntelligence.insights.find(
      (i) => i.category === "cashflow"
    );
    expect(cashInsight?.confidence).toBe("low");
  });
});

describe("buildCopilotIntelligenceBundle — data consistency", () => {
  it("bundle workflows equal input workflows (same reference count)", () => {
    const workflows = [makeWorkflow("wf-1"), makeWorkflow("wf-2")];
    const bundle = buildCopilotIntelligenceBundle(makeInput({ workflows }));
    expect(bundle.workflows).toHaveLength(2);
    expect(bundle.workflows[0]?.id).toBe("wf-1");
  });

  it("bundle events equal input events", () => {
    const events = [
      {
        id: "ev-1",
        eventType: "workflow_completed" as const,
        typeLabel: "Completado",
        severity: "success" as const,
        entityType: "workflow" as const,
        entityId: "wf-1",
        entityLabel: "WF 1",
        actorLabel: null,
        detail: null,
        occurredAt: NOW.toISOString(),
        href: null,
        contextLabel: null,
      },
    ];
    const bundle = buildCopilotIntelligenceBundle(makeInput({ events }));
    expect(bundle.events).toHaveLength(1);
  });

  it("bundle governance equals input governance", () => {
    const governance = emptyGovernance();
    const bundle = buildCopilotIntelligenceBundle(makeInput({ governance }));
    expect(bundle.governance).toBe(governance);
  });
});
