import { describe, expect, it } from "vitest";

import {
  compareWorkflowPriority,
  computeWorkflowSla,
  computeWorkflowUrgencyScore,
} from "@/lib/copilot-operational-workflow-scoring";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";

const NOW = new Date("2026-05-14T12:00:00.000Z");

function workflow(overrides: Partial<OperationalWorkflowExecution> = {}): OperationalWorkflowExecution {
  return {
    id: "wf-1",
    workspaceCompanyId: "ws-1",
    templateId: "template:critical_cash",
    type: "critical_cash",
    title: "Caja crítica",
    dedupeKey: "workflow:critical_cash:caja-critica",
    status: "active",
    progressPercent: 0,
    currentStepId: "step-1",
    currentStepTitle: "Paso 1",
    ownerLabel: null,
    nextDueAt: "2026-05-14T13:00:00.000Z",
    isOverdue: false,
    steps: [
      {
        stepId: "step-1",
        title: "Paso 1",
        order: 1,
        status: "active",
        ownerLabel: null,
        dueAt: "2026-05-14T13:00:00.000Z",
        activatedAt: "2026-05-14T11:00:00.000Z",
        completedAt: null,
        blockedReason: null,
      },
    ],
    createdAt: "2026-05-13T12:00:00.000Z",
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("operational workflow scoring", () => {
  it("calcula SLA healthy, warning y breached", () => {
    expect(computeWorkflowSla(workflow(), NOW).slaStatus).toBe("warning");
    expect(
      computeWorkflowSla(
        workflow({ nextDueAt: "2026-05-14T20:00:00.000Z", steps: [] }),
        NOW
      ).slaStatus
    ).toBe("healthy");
    expect(
      computeWorkflowSla(
        workflow({ nextDueAt: "2026-05-14T10:00:00.000Z", steps: [] }),
        NOW
      ).slaStatus
    ).toBe("breached");
  });

  it("ordena por urgencyScore y estado blocked", () => {
    const blocked = workflow({ status: "blocked", urgencyScore: 10 });
    const urgent = workflow({ urgencyScore: 80 });
    expect(compareWorkflowPriority(blocked, urgent)).toBeLessThan(0);
    expect(computeWorkflowUrgencyScore(workflow({ status: "blocked" }), NOW, { signalStrength: "critical" })).toBeGreaterThan(
      computeWorkflowUrgencyScore(workflow(), NOW, { signalStrength: "normal" })
    );
  });
});
