import type {
  OperationalAutomationEscalation,
  OperationalAutomationEventDraft,
  OperationalAutomationInput,
  OperationalAutomationItem,
  OperationalAutomationRecommendation,
  OperationalAutomationResult,
} from "@/lib/copilot-operational-automation-types";
import {
  deriveMemoryMetrics,
  evaluateAutoEscalation,
  evaluateFollowUpAutomation,
  evaluateResolutionSuggestion,
  linkRelatedWorkflows,
} from "@/lib/copilot-operational-automation-rules";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";

function automationKey(parts: string[]): string {
  return parts.filter(Boolean).join("|");
}

export type OperationalAutomationRunResult = OperationalAutomationResult & {
  workflows: OperationalWorkflowExecution[];
  eventDrafts: OperationalAutomationEventDraft[];
};

export function runOperationalAutomations(
  input: OperationalAutomationInput
): OperationalAutomationRunResult {
  const automations: OperationalAutomationItem[] = [];
  const escalations: OperationalAutomationEscalation[] = [];
  const recommendations: OperationalAutomationRecommendation[] = [];
  const eventDrafts: OperationalAutomationEventDraft[] = [];
  const seen = new Set<string>();
  const memorySignals = input.memorySignals ?? input.snapshot.memory ?? [];
  const relatedByWorkflow = linkRelatedWorkflows(input.workflows);

  const pushAutomation = (item: OperationalAutomationItem) => {
    const key = automationKey([item.kind, item.workflowId, item.dedupeKey ?? "", item.id]);
    if (seen.has(key)) return;
    seen.add(key);
    automations.push(item);
  };

  for (const workflow of input.workflows) {
    if (workflow.status !== "active" && workflow.status !== "blocked") continue;

    const escalation = evaluateAutoEscalation(workflow, input);
    if (escalation) {
      const key = automationKey(["auto_escalation", workflow.id]);
      if (!seen.has(key)) {
        seen.add(key);
        escalations.push(escalation);
        pushAutomation({
          id: escalation.id,
          kind: "auto_escalation",
          workflowId: workflow.id,
          dedupeKey: workflow.dedupeKey,
          title: escalation.title,
          summary: escalation.detail,
          tags: escalation.tags,
          severity: escalation.severity,
          metadata: escalation.metadata,
        });
        eventDrafts.push({
          eventType: "workflow_escalated",
          workflow,
          title: workflow.title,
          detail: escalation.detail,
          metadata: { source: "automation_engine", ...escalation.metadata },
        });
      }
    }

    const followUp = evaluateFollowUpAutomation(workflow, input);
    if (followUp) {
      pushAutomation(followUp.automation);
      recommendations.push(followUp.recommendation);
      eventDrafts.push({
        eventType: "workflow_followup_recommended",
        workflow,
        title: workflow.title,
        detail: followUp.recommendation.summary,
        metadata: followUp.automation.metadata,
      });
      if ((workflow.lifecycle?.reopenCount ?? 0) >= 2) {
        pushAutomation({
          id: `recurring:${workflow.dedupeKey}`,
          kind: "recurring_detection",
          workflowId: workflow.id,
          dedupeKey: workflow.dedupeKey,
          title: `Patrón recurrente · ${workflow.title}`,
          summary: "El workflow reaparece con la misma clave operativa.",
          tags: ["recurrent_issue"],
          severity: followUp.automation.severity,
          metadata: { reopenCount: workflow.lifecycle?.reopenCount ?? 0 },
        });
        eventDrafts.push({
          eventType: "workflow_recurring_detected",
          workflow,
          title: workflow.title,
          detail: `Reaperturas: ${workflow.lifecycle?.reopenCount ?? 0}`,
          metadata: { dedupeKey: workflow.dedupeKey },
        });
      }
    }

    const resolution = evaluateResolutionSuggestion(workflow, input);
    if (resolution) {
      const key = automationKey(["resolution", workflow.id]);
      if (!seen.has(key)) {
        seen.add(key);
        recommendations.push(resolution);
        eventDrafts.push({
          eventType: "workflow_resolution_recommended",
          workflow,
          title: workflow.title,
          detail: resolution.summary,
          metadata: resolution.metadata,
        });
      }
    }

    const relatedWorkflowIds = relatedByWorkflow.get(workflow.id) ?? [];
    if (relatedWorkflowIds.length > 0) {
      pushAutomation({
        id: `linked:${workflow.id}`,
        kind: "workflow_link",
        workflowId: workflow.id,
        dedupeKey: workflow.dedupeKey,
        title: `Relacionado con ${relatedWorkflowIds.length} workflow${relatedWorkflowIds.length === 1 ? "" : "s"}`,
        summary: "Comparte señales o acciones operativas con otros workflows activos.",
        tags: [],
        severity: "low",
        metadata: { relatedWorkflowIds },
      });
      eventDrafts.push({
        eventType: "workflow_linked",
        workflow,
        title: workflow.title,
        detail: `Relacionado con ${relatedWorkflowIds.length} workflows`,
        metadata: { relatedWorkflowIds },
      });
    }
  }

  const memoryDerived: OperationalAutomationRunResult["memoryDerived"] = {};
  for (const workflow of input.workflows) {
    memoryDerived[workflow.id] = deriveMemoryMetrics(workflow, input.events, memorySignals);
  }

  const workflows = input.workflows.map((workflow) => ({
    ...workflow,
    relatedWorkflowIds: relatedByWorkflow.get(workflow.id) ?? workflow.relatedWorkflowIds ?? [],
    urgencyScore:
      escalations.find((item) => item.workflowId === workflow.id) != null
        ? Math.min(100, (workflow.urgencyScore ?? 0) + 20)
        : workflow.urgencyScore,
  }));

  return {
    automations,
    escalations,
    recommendations,
    memoryDerived,
    computedAt: input.now.toISOString(),
    workflows,
    eventDrafts,
  };
}
