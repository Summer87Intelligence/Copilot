import type { OperationalFeedGroup, OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";
import type { StrategicRecommendation } from "@/lib/copilot-strategic-recommendations-types";

export type OperationalActionEvent = {
  id: string;
  actionId: string;
  eventType: string;
  actorLabel: string | null;
  actionTitle: string | null;
  relatedEntityId: string | null;
  createdAt: string;
};

export type CopilotRutasSnapshotCounts = {
  feedItems: number;
  groups: number;
  memorySignals: number;
  narratives: number;
  recommendations: number;
  timelineEvents: number;
};

export type CopilotRutasSnapshot = {
  generatedAt: string;
  feed: {
    items: OperationalFeedItem[];
    groups: OperationalFeedGroup[];
    priorities: OperationalFeedGroup[];
  };
  timeline: OperationalActionEvent[];
  memory: OperationalMemorySignal[];
  narratives: OperationalNarrative[];
  recommendations: StrategicRecommendation[];
  counts: CopilotRutasSnapshotCounts;
};

export type CopilotRutasSnapshotApiSuccess = {
  ok: true;
  data: CopilotRutasSnapshot;
};

export type CopilotRutasSnapshotApiFailure = {
  ok: false;
  code: string;
  message: string;
};

export type CopilotRutasSnapshotApiResponse =
  | CopilotRutasSnapshotApiSuccess
  | CopilotRutasSnapshotApiFailure;
