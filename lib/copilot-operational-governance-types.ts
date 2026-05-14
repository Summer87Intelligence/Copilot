import type {
  OperationalAutomationActionMode,
  OperationalAutomationExplanation,
  OperationalAutomationItem,
  OperationalAutomationRecommendation,
  OperationalAutomationRuleCategory,
  OperationalAutomationRuleRiskLevel,
} from "@/lib/copilot-operational-automation-types";

export type OperationalAutomationRuleDefinition = {
  id: string;
  name: string;
  description: string;
  category: OperationalAutomationRuleCategory;
  defaultEnabled: boolean;
  riskLevel: OperationalAutomationRuleRiskLevel;
  actionMode: OperationalAutomationActionMode;
  cooldownMinutes?: number;
};

export type OperationalAutomationGovernanceRuleState = {
  ruleId: string;
  enabled: boolean;
  cooldownMinutes?: number;
  mutedUntil?: string;
};

export type OperationalAutomationGovernanceState = {
  rules: OperationalAutomationGovernanceRuleState[];
};

export type OperationalAutomationAuditDecision =
  | "generated"
  | "skipped_disabled"
  | "skipped_muted"
  | "skipped_cooldown"
  | "skipped_restricted";

export type OperationalAutomationAuditEvent = {
  ruleId: string;
  workflowId?: string;
  actionId?: string;
  decision: OperationalAutomationAuditDecision;
  reasons: string[];
  generatedAt: string;
};

export type OperationalGovernedAutomation = {
  automation: OperationalAutomationItem;
  recommendation?: OperationalAutomationRecommendation;
  rule: OperationalAutomationRuleDefinition;
  explanation: OperationalAutomationExplanation;
};

export type OperationalAutomationGovernanceHealth = {
  status: "ok" | "partial";
  warnings: Array<{ source: string; code: string; message: string }>;
};

export type OperationalAutomationGovernanceResponse = {
  rules: Array<
    OperationalAutomationRuleDefinition & {
      runtime: OperationalAutomationGovernanceRuleState;
    }
  >;
  activeAutomations: OperationalGovernedAutomation[];
  auditEvents: OperationalAutomationAuditEvent[];
  generatedAt: string;
  health: OperationalAutomationGovernanceHealth;
};
