import type { SnapshotHealth } from "@/lib/copilot-rutas-snapshot-types";
import type { OperationalAutomationGovernanceResponse } from "@/lib/copilot-operational-governance-types";
import type { OperationalAutomationResult } from "@/lib/copilot-operational-automation-types";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";
import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";

export type IntelligenceInsightSeverity = "critical" | "high" | "medium" | "low";

export type IntelligenceInsightCategory =
  | "cashflow"
  | "collections"
  | "operations"
  | "governance"
  | "execution"
  | "risk";

export type OperationalIntelligenceInsight = {
  id: string;
  severity: IntelligenceInsightSeverity;
  category: IntelligenceInsightCategory;
  title: string;
  cause: string;
  impact: string;
  nextBestAction: string;
  consequenceIfIgnored: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  linkedWorkflowIds: string[];
  linkedEventIds: string[];
  linkedActionIds: string[];
};

export type OperationalIntelligencePattern = {
  title: string;
  description: string;
  evidence: string[];
};

export type OperationalIntelligenceHealth = {
  status: "ok" | "partial" | "degraded";
  warnings: string[];
};

export type OperationalIntelligenceResponse = {
  generatedAt: string;
  insights: OperationalIntelligenceInsight[];
  topPattern?: OperationalIntelligencePattern;
  health: OperationalIntelligenceHealth;
};

export type OperationalIntelligenceInput = {
  now: Date;
  workflows: OperationalWorkflowExecution[];
  operationalEvents: OperationalTimelineItem[];
  memorySignals: OperationalMemorySignal[];
  operationalAutomation: OperationalAutomationResult | null;
  governance: OperationalAutomationGovernanceResponse;
  snapshotHealth: SnapshotHealth | null;
};

export type OperationalIntelligenceApiSuccess = {
  ok: true;
  intelligence: OperationalIntelligenceResponse;
};

export type OperationalIntelligenceApiFailure = {
  ok: false;
  code: string;
  message: string;
};

export type OperationalIntelligenceApiResponse =
  | OperationalIntelligenceApiSuccess
  | OperationalIntelligenceApiFailure;
