import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";
import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";
import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";

export type OperationalAutomationKind =
  | "auto_escalation"
  | "follow_up"
  | "resolution_suggestion"
  | "workflow_link"
  | "recurring_detection";

export type OperationalAutomationTag =
  | "needs_attention"
  | "recurrent_issue"
  | "workflow_can_be_completed"
  | "follow_up_recommended";

export type OperationalAutomationSeverity = "low" | "medium" | "high" | "critical";

export type OperationalAutomationRuleCategory =
  | "sla"
  | "recurrence"
  | "resolution"
  | "linking"
  | "ownership"
  | "risk";

export type OperationalAutomationRuleRiskLevel = "safe" | "supervised" | "restricted";

export type OperationalAutomationActionMode =
  | "suggest_only"
  | "auto_flag"
  | "auto_event"
  | "requires_confirmation";

export type OperationalAutomationExplanation = {
  summary: string;
  reasons: string[];
  evidence: string[];
  ruleId: string;
  confidence: "high" | "medium" | "low";
};

export type OperationalMemoryDerivedMetrics = {
  recurrenceScore: number;
  reopenFrequency: number;
  unresolvedChainCount: number;
  historicalSeverity: OperationalAutomationSeverity;
};

export type OperationalAutomationItem = {
  id: string;
  kind: OperationalAutomationKind;
  workflowId: string;
  dedupeKey?: string;
  title: string;
  summary: string;
  tags: OperationalAutomationTag[];
  severity: OperationalAutomationSeverity;
  ruleId: string;
  riskLevel: OperationalAutomationRuleRiskLevel;
  actionMode: OperationalAutomationActionMode;
  explanation: OperationalAutomationExplanation;
  metadata?: Record<string, unknown>;
};

export type OperationalAutomationEscalation = {
  id: string;
  workflowId: string;
  title: string;
  detail: string;
  severity: OperationalAutomationSeverity;
  tags: OperationalAutomationTag[];
  urgencyDelta: number;
  ruleId: string;
  riskLevel: OperationalAutomationRuleRiskLevel;
  actionMode: OperationalAutomationActionMode;
  explanation: OperationalAutomationExplanation;
  metadata?: Record<string, unknown>;
};

export type OperationalAutomationRecommendation = {
  id: string;
  workflowId: string;
  code: "workflow_can_be_completed" | "follow_up_recommended" | "assign_owner";
  title: string;
  summary: string;
  severity: OperationalAutomationSeverity;
  ruleId: string;
  riskLevel: OperationalAutomationRuleRiskLevel;
  actionMode: OperationalAutomationActionMode;
  explanation: OperationalAutomationExplanation;
  metadata?: Record<string, unknown>;
};

import type { OperationalAutomationAuditEvent } from "@/lib/copilot-operational-governance-types";

export type OperationalAutomationResult = {
  automations: OperationalAutomationItem[];
  escalations: OperationalAutomationEscalation[];
  recommendations: OperationalAutomationRecommendation[];
  memoryDerived: Record<string, OperationalMemoryDerivedMetrics>;
  computedAt: string;
  auditEvents?: OperationalAutomationAuditEvent[];
};

export type OperationalAutomationInput = {
  workspaceCompanyId: string;
  now: Date;
  snapshot: Pick<
    CopilotRutasSnapshot,
    "feed" | "memory" | "narratives" | "recommendations" | "generatedAt"
  >;
  workflows: OperationalWorkflowExecution[];
  actions: OperationalActionListItem[];
  events: OperationalTimelineItem[];
  memorySignals?: OperationalMemorySignal[];
};

export type OperationalAutomationEventDraft = {
  eventType:
    | "workflow_followup_recommended"
    | "workflow_resolution_recommended"
    | "workflow_linked"
    | "workflow_recurring_detected"
    | "workflow_escalated";
  workflow: OperationalWorkflowExecution;
  title: string;
  detail?: string | null;
  metadata?: Record<string, unknown>;
};

export type OperationalAutomationMetadata = {
  escalationCount: number;
  followUpCount: number;
  resolutionSuggestionCount: number;
  linkedWorkflowCount: number;
  recurringDetectionCount: number;
  flags: OperationalAutomationTag[];
};
