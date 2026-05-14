import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";
import type {
  OperationalAutomationEscalation,
  OperationalAutomationInput,
  OperationalAutomationItem,
  OperationalAutomationRecommendation,
  OperationalAutomationSeverity,
  OperationalMemoryDerivedMetrics,
} from "@/lib/copilot-operational-automation-types";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";
import { hasWorkflowJustifyingSignal } from "@/lib/copilot-operational-workflow-signals";
import type { WorkflowSignalsInput } from "@/lib/copilot-operational-workflow-signals";

export const AUTO_ESCALATION_OPEN_MINUTES = 60;
export const RECURRING_REOPEN_THRESHOLD = 2;

function minutesOpen(createdAt: string, now: Date): number {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - created.getTime()) / 60_000));
}

function isCriticalWorkflow(workflow: OperationalWorkflowExecution): boolean {
  return workflow.type === "critical_cash" || (workflow.urgencyScore ?? 0) >= 80;
}

function isOpenWorkflow(workflow: OperationalWorkflowExecution): boolean {
  return workflow.status === "active" || workflow.status === "blocked";
}

function severityFromWorkflow(workflow: OperationalWorkflowExecution): OperationalAutomationSeverity {
  if (workflow.type === "critical_cash" || workflow.slaStatus === "breached") return "critical";
  if (workflow.status === "blocked" || workflow.slaStatus === "warning") return "high";
  if (workflow.type === "priority_collections") return "medium";
  return "low";
}

function bumpSeverity(severity: OperationalAutomationSeverity): OperationalAutomationSeverity {
  if (severity === "low") return "medium";
  if (severity === "medium") return "high";
  if (severity === "high") return "critical";
  return "critical";
}

export function evaluateAutoEscalation(
  workflow: OperationalWorkflowExecution,
  input: OperationalAutomationInput
): OperationalAutomationEscalation | null {
  if (!isOpenWorkflow(workflow)) return null;
  if (!isCriticalWorkflow(workflow)) return null;
  if (workflow.slaStatus !== "breached") return null;
  if (workflow.assignedUserId || workflow.ownerLabel) return null;
  if (minutesOpen(workflow.createdAt, input.now) < AUTO_ESCALATION_OPEN_MINUTES) return null;

  const baseSeverity = severityFromWorkflow(workflow);
  return {
    id: `escalation:${workflow.id}`,
    workflowId: workflow.id,
    title: workflow.title,
    detail: `Crítico sin responsable con SLA vencido hace ${minutesOpen(workflow.createdAt, input.now)} min.`,
    severity: bumpSeverity(baseSeverity),
    tags: ["needs_attention"],
    urgencyDelta: 20,
    metadata: {
      dedupeKey: workflow.dedupeKey,
      slaStatus: workflow.slaStatus,
      openMinutes: minutesOpen(workflow.createdAt, input.now),
    },
  };
}

export function evaluateFollowUpAutomation(
  workflow: OperationalWorkflowExecution,
  input: OperationalAutomationInput
): {
  automation: OperationalAutomationItem;
  recommendation: OperationalAutomationRecommendation;
} | null {
  const reopenCount = workflow.lifecycle?.reopenCount ?? 0;
  if (reopenCount < RECURRING_REOPEN_THRESHOLD) return null;
  if (!isOpenWorkflow(workflow)) return null;

  const automation: OperationalAutomationItem = {
    id: `follow-up:${workflow.dedupeKey}`,
    kind: "follow_up",
    workflowId: workflow.id,
    dedupeKey: workflow.dedupeKey,
    title: `Seguimiento recomendado · ${workflow.title}`,
    summary: `Reabierto ${reopenCount} veces con la misma clave operativa.`,
    tags: ["follow_up_recommended", "recurrent_issue"],
    severity: reopenCount >= 3 ? "high" : "medium",
    metadata: { reopenCount, dedupeKey: workflow.dedupeKey },
  };

  const recommendation: OperationalAutomationRecommendation = {
    id: `follow-up-rec:${workflow.id}`,
    workflowId: workflow.id,
    code: "follow_up_recommended",
    title: "Revisar patrón recurrente",
    summary: "Registrar nota operativa y validar si el workflow debe redefinirse.",
    severity: automation.severity,
    metadata: { reopenCount, dedupeKey: workflow.dedupeKey },
  };

  return { automation, recommendation };
}

export function evaluateResolutionSuggestion(
  workflow: OperationalWorkflowExecution,
  input: OperationalAutomationInput
): OperationalAutomationRecommendation | null {
  if (!isOpenWorkflow(workflow)) return null;
  if (workflow.status === "blocked") return null;

  const signalInput: WorkflowSignalsInput = {
    snapshot: input.snapshot,
    actions: input.actions,
  };
  if (hasWorkflowJustifyingSignal(workflow, signalInput)) return null;

  return {
    id: `resolution:${workflow.id}`,
    workflowId: workflow.id,
    code: "workflow_can_be_completed",
    title: "Se puede completar el workflow",
    summary: "La señal operativa ya no justifica mantenerlo activo.",
    severity: "medium",
    metadata: { dedupeKey: workflow.dedupeKey },
  };
}

export function linkRelatedWorkflows(
  workflows: OperationalWorkflowExecution[]
): Map<string, string[]> {
  const open = workflows.filter(isOpenWorkflow);
  const links = new Map<string, Set<string>>();

  const addLink = (leftId: string, rightId: string) => {
    if (leftId === rightId) return;
    if (!links.has(leftId)) links.set(leftId, new Set());
    links.get(leftId)!.add(rightId);
  };

  for (let index = 0; index < open.length; index += 1) {
    for (let inner = index + 1; inner < open.length; inner += 1) {
      const left = open[index]!;
      const right = open[inner]!;
      const sharedActions = (left.relatedActionIds ?? []).some((actionId) =>
        (right.relatedActionIds ?? []).includes(actionId)
      );
      const relatedTypes =
        (left.type === "critical_cash" && right.type === "priority_collections") ||
        (left.type === "priority_collections" && right.type === "critical_cash") ||
        (left.type === "blocked_followup" && right.type === "priority_collections");

      if (sharedActions || relatedTypes) {
        addLink(left.id, right.id);
        addLink(right.id, left.id);
      }
    }
  }

  return new Map([...links.entries()].map(([workflowId, related]) => [workflowId, [...related]]));
}

export function deriveMemoryMetrics(
  workflow: OperationalWorkflowExecution,
  events: OperationalTimelineItem[],
  memorySignals: OperationalMemorySignal[]
): OperationalMemoryDerivedMetrics {
  const reopenCount = workflow.lifecycle?.reopenCount ?? 0;
  const relatedEvents = events.filter(
    (event) => event.entityId === workflow.id || event.eventType.includes("workflow")
  );
  const recurringSignals = memorySignals.filter((signal) =>
    (signal.relatedActionIds ?? []).some((actionId) =>
      (workflow.relatedActionIds ?? []).includes(actionId)
    )
  );

  const recurrenceScore = Math.min(
    100,
    reopenCount * 25 +
      recurringSignals.filter((signal) => signal.type === "recurring_issue").length * 20
  );
  const unresolvedChainCount = relatedEvents.filter((event) =>
    ["workflow_reopened", "workflow_blocked", "workflow_sla_breached"].includes(event.eventType)
  ).length;

  return {
    recurrenceScore,
    reopenFrequency: reopenCount,
    unresolvedChainCount,
    historicalSeverity: severityFromWorkflow(workflow),
  };
}

export function summarizeAutomationFromTimeline(
  events: OperationalTimelineItem[]
): ReturnType<typeof summarizeAutomationMetadata> {
  const flags = new Set<OperationalAutomationItem["tags"][number]>();
  for (const event of events) {
    if (event.eventType === "workflow_escalated") flags.add("needs_attention");
    if (event.eventType === "workflow_recurring_detected") flags.add("recurrent_issue");
    if (event.eventType === "workflow_followup_recommended") flags.add("follow_up_recommended");
    if (event.eventType === "workflow_resolution_recommended") flags.add("workflow_can_be_completed");
  }

  return {
    escalationCount: events.filter((event) => event.eventType === "workflow_escalated").length,
    followUpCount: events.filter((event) => event.eventType === "workflow_followup_recommended").length,
    resolutionSuggestionCount: events.filter(
      (event) => event.eventType === "workflow_resolution_recommended"
    ).length,
    linkedWorkflowCount: events.filter((event) => event.eventType === "workflow_linked").length,
    recurringDetectionCount: events.filter((event) => event.eventType === "workflow_recurring_detected")
      .length,
    flags: [...flags],
  };
}

export function summarizeAutomationMetadata(
  automations: OperationalAutomationItem[],
  escalations: OperationalAutomationEscalation[],
  recommendations: OperationalAutomationRecommendation[]
) {
  const flags = new Set<OperationalAutomationItem["tags"][number]>();
  for (const item of automations) {
    for (const tag of item.tags) flags.add(tag);
  }
  for (const item of escalations) {
    for (const tag of item.tags) flags.add(tag);
  }

  return {
    escalationCount: escalations.length,
    followUpCount: automations.filter((item) => item.kind === "follow_up").length,
    resolutionSuggestionCount: recommendations.filter(
      (item) => item.code === "workflow_can_be_completed"
    ).length,
    linkedWorkflowCount: automations.filter((item) => item.kind === "workflow_link").length,
    recurringDetectionCount: automations.filter((item) => item.kind === "recurring_detection").length,
    flags: [...flags],
  };
}
