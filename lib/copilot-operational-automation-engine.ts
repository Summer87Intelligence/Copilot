import { AUTOMATION_KIND_RULE_IDS, getOperationalAutomationRule } from "@/lib/copilot-operational-automation-registry";
import {
  appendAutomationAuditEvent,
  canApplyAutomationRule,
  getGovernanceContextForWorkspace,
  recordAutomationRuleCooldown,
} from "@/lib/copilot-operational-governance";
import type { OperationalAutomationAuditEvent } from "@/lib/copilot-operational-governance-types";
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

function auditSkipped(
  auditEvents: OperationalAutomationAuditEvent[],
  event: Omit<OperationalAutomationAuditEvent, "generatedAt">
): void {
  auditEvents.push({
    ...event,
    generatedAt: new Date().toISOString(),
  });
}

export function runOperationalAutomations(
  input: OperationalAutomationInput
): OperationalAutomationRunResult {
  const context = getGovernanceContextForWorkspace(input.workspaceCompanyId, input.now);
  const auditEvents: OperationalAutomationAuditEvent[] = [];
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

  const applyRule = (
    ruleId: string,
    workflowId: string,
    onAllowed: () => void
  ): boolean => {
    const gate = canApplyAutomationRule(context, ruleId, workflowId);
    if (!gate.allowed) {
      auditSkipped(auditEvents, {
        ruleId,
        workflowId,
        decision: gate.decision,
        reasons: gate.reasons,
      });
      return false;
    }
    onAllowed();
    recordAutomationRuleCooldown(context, ruleId, workflowId);
    appendAutomationAuditEvent(context, {
      ruleId,
      workflowId,
      decision: "generated",
      reasons: gate.reasons,
    });
    return true;
  };

  for (const workflow of input.workflows) {
    if (workflow.status !== "active" && workflow.status !== "blocked") continue;

    const escalation = evaluateAutoEscalation(workflow, input);
    if (escalation) {
      const ruleId = AUTOMATION_KIND_RULE_IDS.auto_escalation;
      applyRule(ruleId, workflow.id, () => {
        const key = automationKey(["auto_escalation", workflow.id]);
        if (seen.has(key)) return;
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
          ruleId: escalation.ruleId,
          riskLevel: escalation.riskLevel,
          actionMode: escalation.actionMode,
          explanation: escalation.explanation,
          metadata: escalation.metadata,
        });
        if (escalation.actionMode === "auto_event") {
          eventDrafts.push({
            eventType: "workflow_escalated",
            workflow,
            title: workflow.title,
            detail: escalation.detail,
            metadata: { source: "automation_engine", ruleId, ...escalation.metadata },
          });
        }
      });
    }

    const followUp = evaluateFollowUpAutomation(workflow, input);
    if (followUp) {
      const followUpRuleId = AUTOMATION_KIND_RULE_IDS.follow_up;
      applyRule(followUpRuleId, workflow.id, () => {
        pushAutomation(followUp.automation);
        recommendations.push(followUp.recommendation);
        if (followUp.automation.actionMode !== "requires_confirmation") {
          eventDrafts.push({
            eventType: "workflow_followup_recommended",
            workflow,
            title: workflow.title,
            detail: followUp.recommendation.summary,
            metadata: { ruleId: followUpRuleId, ...followUp.automation.metadata },
          });
        }
      });

      if ((workflow.lifecycle?.reopenCount ?? 0) >= 2) {
        const recurringRuleId = AUTOMATION_KIND_RULE_IDS.recurring_detection;
        applyRule(recurringRuleId, workflow.id, () => {
          const recurringRule = getOperationalAutomationRule(recurringRuleId);
          const explanation = {
            ruleId: recurringRuleId,
            summary: "Patrón recurrente porque el workflow reaparece con la misma clave operativa.",
            reasons: [`Reaperturas: ${workflow.lifecycle?.reopenCount ?? 0}.`, "Misma dedupeKey operativa."],
            evidence: [`dedupeKey: ${workflow.dedupeKey}`, `workflowId: ${workflow.id}`],
            confidence: "medium" as const,
          };
          pushAutomation({
            id: `recurring:${workflow.dedupeKey}`,
            kind: "recurring_detection",
            workflowId: workflow.id,
            dedupeKey: workflow.dedupeKey,
            title: `Patrón recurrente · ${workflow.title}`,
            summary: "El workflow reaparece con la misma clave operativa.",
            tags: ["recurrent_issue"],
            severity: followUp.automation.severity,
            ruleId: recurringRuleId,
            riskLevel: recurringRule?.riskLevel ?? "safe",
            actionMode: recurringRule?.actionMode ?? "auto_flag",
            explanation,
            metadata: { reopenCount: workflow.lifecycle?.reopenCount ?? 0 },
          });
          eventDrafts.push({
            eventType: "workflow_recurring_detected",
            workflow,
            title: workflow.title,
            detail: `Reaperturas: ${workflow.lifecycle?.reopenCount ?? 0}`,
            metadata: { ruleId: recurringRuleId, dedupeKey: workflow.dedupeKey },
          });
        });
      }
    }

    const resolution = evaluateResolutionSuggestion(workflow, input);
    if (resolution) {
      const ruleId = AUTOMATION_KIND_RULE_IDS.resolution_suggestion;
      applyRule(ruleId, workflow.id, () => {
        const key = automationKey(["resolution", workflow.id]);
        if (seen.has(key)) return;
        seen.add(key);
        recommendations.push(resolution);
        if (resolution.actionMode !== "requires_confirmation") {
          eventDrafts.push({
            eventType: "workflow_resolution_recommended",
            workflow,
            title: workflow.title,
            detail: resolution.summary,
            metadata: { ruleId, ...resolution.metadata },
          });
        }
      });
    }

    const relatedWorkflowIds = relatedByWorkflow.get(workflow.id) ?? [];
    if (relatedWorkflowIds.length > 0) {
      const ruleId = AUTOMATION_KIND_RULE_IDS.workflow_link;
      applyRule(ruleId, workflow.id, () => {
        const linkRule = getOperationalAutomationRule(ruleId);
        const explanation = {
          ruleId,
          summary: "Workflow vinculado porque comparte señales o acciones con otros workflows activos.",
          reasons: [`Relacionados: ${relatedWorkflowIds.length}.`, "Workflows abiertos en el mismo tenant."],
          evidence: [`workflowId: ${workflow.id}`, `related: ${relatedWorkflowIds.join(",")}`],
          confidence: "high" as const,
        };
        pushAutomation({
          id: `linked:${workflow.id}`,
          kind: "workflow_link",
          workflowId: workflow.id,
          dedupeKey: workflow.dedupeKey,
          title: `Relacionado con ${relatedWorkflowIds.length} workflow${relatedWorkflowIds.length === 1 ? "" : "s"}`,
          summary: "Comparte señales o acciones operativas con otros workflows activos.",
          tags: [],
          severity: "low",
          ruleId,
          riskLevel: linkRule?.riskLevel ?? "safe",
          actionMode: linkRule?.actionMode ?? "auto_flag",
          explanation,
          metadata: { relatedWorkflowIds },
        });
        eventDrafts.push({
          eventType: "workflow_linked",
          workflow,
          title: workflow.title,
          detail: `Relacionado con ${relatedWorkflowIds.length} workflows`,
          metadata: { ruleId, relatedWorkflowIds },
        });
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

  const computedAt = input.now.toISOString();

  return {
    automations,
    escalations,
    recommendations,
    memoryDerived,
    computedAt,
    auditEvents: auditEvents,
    workflows,
    eventDrafts,
  };
}
