import type { OperationalAutomationRuleRiskLevel } from "@/lib/copilot-operational-automation-types";
import type { SnapshotHealth } from "@/lib/copilot-rutas-snapshot-types";
import type { OperationalAutomationGovernanceResponse } from "@/lib/copilot-operational-governance-types";
import type { OperationalAutomationResult } from "@/lib/copilot-operational-automation-types";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";
import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";

export type ExecutiveBriefingStatus = "critical" | "warning" | "stable";

export type ExecutiveBriefingDoFirst = {
  title: string;
  reason: string;
  actionLabel: string;
  href?: string;
};

export type ExecutiveBriefingNeedsApproval = {
  title: string;
  reason: string;
  riskLevel: OperationalAutomationRuleRiskLevel;
};

export type ExecutiveBriefing = {
  generatedAt: string;
  status: ExecutiveBriefingStatus;
  headline: string;
  summary: string;
  whatChanged: string[];
  whyItMatters: string[];
  doFirst: ExecutiveBriefingDoFirst[];
  needsApproval: ExecutiveBriefingNeedsApproval[];
  resolvedRecently: string[];
  risksIncreasing: string[];
  confidence: "high" | "medium" | "low";
  evidence: string[];
};

export type ExecutiveBriefingInput = {
  now: Date;
  workflows: OperationalWorkflowExecution[];
  operationalEvents: OperationalTimelineItem[];
  memorySignals: OperationalMemorySignal[];
  operationalAutomation: OperationalAutomationResult | null;
  governance: OperationalAutomationGovernanceResponse;
  snapshotHealth: SnapshotHealth | null;
};

export type ExecutiveBriefingApiSuccess = {
  ok: true;
  briefing: ExecutiveBriefing;
};

export type ExecutiveBriefingApiFailure = {
  ok: false;
  code: string;
  message: string;
};

export type ExecutiveBriefingApiResponse =
  | ExecutiveBriefingApiSuccess
  | ExecutiveBriefingApiFailure;
