import type { CopilotRutasSnapshot, SnapshotHealth } from "@/lib/copilot-rutas-snapshot-types";
import type { OperationalWorkflowExecution } from "@/lib/copilot-operational-workflows-types";
import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import type { OperationalAutomationGovernanceResponse } from "@/lib/copilot-operational-governance-types";
import type { OperationalAutomationResult } from "@/lib/copilot-operational-automation-types";
import type { ExecutiveBriefing } from "@/lib/copilot-executive-briefing-types";
import type { OperationalIntelligenceResponse } from "@/lib/copilot-operational-intelligence-types";
import type { CommandCenterFilter, CommandCenterItem } from "@/lib/copilot-command-center-types";
import type { RebuildHealthSummary } from "@/lib/copilot-operational-telemetry";

export type IntelligenceBundleCommandCenter = {
  items: CommandCenterItem[];
  filters: CommandCenterFilter[];
};

export type IntelligenceBundleHealth = {
  snapshot: SnapshotHealth;
  rebuild: RebuildHealthSummary;
};

export type CopilotIntelligenceBundle = {
  generatedAt: string;
  snapshot: CopilotRutasSnapshot;
  workflows: OperationalWorkflowExecution[];
  operationalAutomation: OperationalAutomationResult | null;
  events: OperationalTimelineItem[];
  governance: OperationalAutomationGovernanceResponse;
  health: IntelligenceBundleHealth;
  executiveBriefing: ExecutiveBriefing;
  operationalIntelligence: OperationalIntelligenceResponse;
  commandCenter: IntelligenceBundleCommandCenter;
  warnings: string[];
  timingMs: Record<string, number>;
};

export type IntelligenceBundleInput = {
  now: Date;
  snapshot: CopilotRutasSnapshot;
  workflows: OperationalWorkflowExecution[];
  operationalAutomation: OperationalAutomationResult | null;
  events: OperationalTimelineItem[];
  governance: OperationalAutomationGovernanceResponse;
  health: IntelligenceBundleHealth;
  currentUser: { id?: string; label?: string };
  timingMs: Record<string, number>;
  warnings: string[];
};

export type IntelligenceBundleApiSuccess = {
  ok: true;
  data: CopilotIntelligenceBundle;
};

export type IntelligenceBundleApiFailure = {
  ok: false;
  code: string;
  message: string;
};

export type IntelligenceBundleApiResponse =
  | IntelligenceBundleApiSuccess
  | IntelligenceBundleApiFailure;
