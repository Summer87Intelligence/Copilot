import type { OperationalFeedSourceKind, OperationalFeedSeverity } from "@/lib/copilot-operational-score";

export type OperationalFeedQuickAction = "assign_to_me" | "resolve" | "block" | "open";

export type OperationalFeedItem = {
  id: string;
  source: OperationalFeedSourceKind;
  severity: OperationalFeedSeverity;
  score: number;
  title: string;
  summary?: string;
  status?: "pending" | "in_progress" | "blocked" | "resolved";
  blocked?: boolean;
  owner?: {
    id?: string;
    label?: string;
  };
  dueAt?: string | null;
  cta?: {
    label: string;
    href?: string;
    action?: string;
  };
  quickActions?: OperationalFeedQuickAction[];
  href?: string;
  metadata?: Record<string, unknown>;
};

export type OperationalFeedTimelineItem = {
  id: string;
  actionId: string;
  eventType: string;
  actorLabel: string | null;
  actionTitle: string | null;
  relatedEntityId: string | null;
  createdAt: string;
  detailSummary?: string | null;
};

export type OperationalFeedResponse = {
  items: OperationalFeedItem[];
  computedAt: string;
};

export type OperationalFeedTimelineResponse = {
  events: OperationalFeedTimelineItem[];
  computedAt: string;
};

export type OperationalFeedGroup = {
  id: string;
  source: OperationalFeedSourceKind;
  severity: OperationalFeedSeverity;
  score: number;
  title: string;
  summary: string;
  itemCount: number;
  primaryItem: OperationalFeedItem;
  items: OperationalFeedItem[];
  cta?: OperationalFeedItem["cta"];
  quickActions?: OperationalFeedItem["quickActions"];
  collapsedByDefault?: boolean;
};

export type OperationalFeedGroupedResponse = {
  items: OperationalFeedItem[];
  groups: OperationalFeedGroup[];
  priorities: OperationalFeedGroup[];
  computedAt: string;
};
