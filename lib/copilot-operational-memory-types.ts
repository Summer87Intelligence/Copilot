export type OperationalMemorySignalType =
  | "recurring_issue"
  | "open_too_long"
  | "improved"
  | "worsened"
  | "resolved_recently"
  | "stale_action";

export type OperationalMemorySeverity = "critical" | "high" | "medium" | "low";

export type OperationalMemorySignal = {
  id: string;
  type: OperationalMemorySignalType;
  severity: OperationalMemorySeverity;
  title: string;
  summary: string;
  evidence: string[];
  relatedActionIds?: string[];
  relatedFeedIds?: string[];
  since?: string;
  lastSeenAt?: string;
  score: number;
  derived?: {
    recurrenceScore?: number;
    reopenFrequency?: number;
    unresolvedChainCount?: number;
    historicalSeverity?: "low" | "medium" | "high" | "critical";
  };
};

export type OperationalMemorySourceCounts = {
  actions: number;
  events: number;
  feedItems: number;
  narratives: number;
};

export type OperationalMemoryResponse = {
  signals: OperationalMemorySignal[];
  generatedAt: string;
  sourceCounts: OperationalMemorySourceCounts;
};
