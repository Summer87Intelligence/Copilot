import { describe, expect, it } from "vitest";

import {
  executionToWorkflowRow,
  mapOperationalWorkflowRow,
} from "@/lib/data/operational-workflows-repository";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";

const BASE_EXECUTION: OperationalWorkflowExecution = {
  id: "wf-1",
  workspaceCompanyId: "ws-1",
  templateId: "template:critical_cash",
  type: "critical_cash",
  title: "Caja crítica",
  dedupeKey: "workflow:critical_cash:caja-critica",
  status: "active",
  progressPercent: 20,
  currentStepId: "step-2",
  currentStepTitle: "Contactar clientes prioritarios",
  ownerLabel: "Operador",
  assignedUserId: "user-1",
  nextDueAt: "2026-05-15T12:00:00.000Z",
  isOverdue: false,
  steps: [
    {
      stepId: "step-1",
      title: "Revisar saldo",
      order: 1,
      status: "completed",
      ownerLabel: null,
      dueAt: null,
      activatedAt: "2026-05-14T10:00:00.000Z",
      completedAt: "2026-05-14T11:00:00.000Z",
      blockedReason: null,
    },
    {
      stepId: "step-2",
      title: "Contactar clientes prioritarios",
      order: 2,
      status: "active",
      ownerLabel: "Operador",
      dueAt: "2026-05-15T12:00:00.000Z",
      activatedAt: "2026-05-14T11:00:00.000Z",
      completedAt: null,
      blockedReason: null,
    },
  ],
  createdAt: "2026-05-14T10:00:00.000Z",
  updatedAt: "2026-05-14T11:00:00.000Z",
  relatedNarrativeIds: ["narrative:cash-critical"],
};

describe("operational workflows repository mapping", () => {
  it("serializa y deserializa filas de workflow", () => {
    const row = executionToWorkflowRow(BASE_EXECUTION);
    expect(row.workspace_company_id).toBe("ws-1");
    expect(row.dedupe_key).toBe("workflow:critical_cash:caja-critica");
    expect(row.assigned_user_id).toBe("user-1");

    const mapped = mapOperationalWorkflowRow({
      id: BASE_EXECUTION.id,
      workspace_company_id: BASE_EXECUTION.workspaceCompanyId,
      dedupe_key: BASE_EXECUTION.dedupeKey,
      workflow_type: BASE_EXECUTION.type,
      title: BASE_EXECUTION.title,
      status: BASE_EXECUTION.status,
      current_step_index: 1,
      assigned_to: BASE_EXECUTION.ownerLabel,
      assigned_user_id: BASE_EXECUTION.assignedUserId,
      source: "copilot_snapshot",
      source_id: BASE_EXECUTION.dedupeKey,
      context: {
        templateId: BASE_EXECUTION.templateId,
        relatedNarrativeIds: BASE_EXECUTION.relatedNarrativeIds,
      },
      steps: BASE_EXECUTION.steps,
      progress: BASE_EXECUTION.progressPercent,
      due_at: BASE_EXECUTION.nextDueAt,
      blocked_reason: null,
      completed_at: null,
      cancelled_at: null,
      created_at: BASE_EXECUTION.createdAt,
      updated_at: BASE_EXECUTION.updatedAt,
    });

    expect(mapped.id).toBe("wf-1");
    expect(mapped.assignedUserId).toBe("user-1");
    expect(mapped.currentStepTitle).toBe("Contactar clientes prioritarios");
    expect(mapped.relatedNarrativeIds).toEqual(["narrative:cash-critical"]);
  });
});
