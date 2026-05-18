/**
 * Phase 3B — CTAs workflow-driven desde tarea/categoría.
 */

import type { CollectionActionType, CollectionStatus } from "@/lib/copilot-collection-types";
import type { ClientOperationalSummary, OperationalTask, TaskCategory } from "@/lib/decision-engine/de-types";
import { defaultActionForCategory } from "@/lib/decision-engine/operational-task-adapters";

export type WorkflowKind = "call" | "payment" | "promise" | "escalate" | "monitor";

export type WorkflowCta = {
  kind: WorkflowKind;
  label: string;
  actionType: CollectionActionType;
  status: CollectionStatus;
};

const WORKFLOW_BY_CATEGORY: Record<TaskCategory, WorkflowCta> = {
  call_today: {
    kind: "call",
    label: "Llamar ahora",
    actionType: "call",
    status: "contacted",
  },
  stale_contact: {
    kind: "call",
    label: "Llamar ahora",
    actionType: "call",
    status: "contacted",
  },
  promise_follow_up: {
    kind: "promise",
    label: "Registrar promesa",
    actionType: "payment_promise",
    status: "promised_payment",
  },
  payment_confirmation: {
    kind: "payment",
    label: "Registrar pago",
    actionType: "internal_note",
    status: "paid",
  },
  escalation_review: {
    kind: "escalate",
    label: "Escalar caso",
    actionType: "escalation",
    status: "escalated",
  },
  legal_review: {
    kind: "escalate",
    label: "Escalar caso",
    actionType: "dispute",
    status: "disputed",
  },
  high_concentration: {
    kind: "call",
    label: "Llamar ahora",
    actionType: "call",
    status: "contacted",
  },
  recovery_watch: {
    kind: "monitor",
    label: "Registrar seguimiento",
    actionType: "internal_note",
    status: "pending_review",
  },
};

export function resolvePrimaryWorkflow(task: OperationalTask): WorkflowCta {
  const preset = WORKFLOW_BY_CATEGORY[task.category];
  if (preset) return preset;
  const defaults = defaultActionForCategory(task.category);
  return {
    kind: "monitor",
    label: task.action_label,
    actionType: defaults.actionType,
    status: defaults.status,
  };
}

export function resolveSummaryWorkflow(summary: ClientOperationalSummary): WorkflowCta {
  return resolvePrimaryWorkflow(summary.primary_action);
}
