export type CommandCenterItemType = "workflow" | "action" | "memory" | "event";

export type CommandCenterSeverity = "critical" | "high" | "medium" | "low";

export type CommandCenterStatus =
  | "active"
  | "blocked"
  | "overdue"
  | "assigned"
  | "unassigned"
  | "resolved"
  | "suppressed";

export type CommandCenterFilter =
  | "all"
  | "critical"
  | "blocked"
  | "overdue"
  | "mine"
  | "unassigned"
  | "recurring";

export type CommandCenterCta = {
  label: string;
  href?: string;
  action?: string;
};

export type CommandCenterItem = {
  id: string;
  type: CommandCenterItemType;
  severity: CommandCenterSeverity;
  status: CommandCenterStatus;
  title: string;
  summary: string;
  ownerLabel?: string;
  dueLabel?: string;
  urgencyScore: number;
  cta: CommandCenterCta;
  metadata?: Record<string, unknown>;
};

export type CommandCenterCurrentUser = {
  id?: string;
  label?: string;
};

export type CommandCenterQueueInput = {
  workflows: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    progressPercent: number;
    currentStepTitle?: string | null;
    currentStepId?: string | null;
    ownerLabel?: string | null;
    assignedUserId?: string | null;
    urgencyScore?: number;
    slaStatus?: string;
    slaDueAt?: string | null;
    relatedActionIds?: string[];
    relatedCounts?: { actions: number; alerts: number; insights: number };
    lifecycle?: { reopenCount?: number };
    dedupeKey?: string;
  }>;
  feedItems: Array<{
    id: string;
    source: string;
    severity: CommandCenterSeverity;
    title: string;
    summary?: string;
    status?: string;
    blocked?: boolean;
    owner?: { id?: string; label?: string };
    dueAt?: string | null;
    score: number;
    href?: string;
    metadata?: Record<string, unknown>;
  }>;
  memorySignals: Array<{
    id: string;
    type: string;
    severity: CommandCenterSeverity;
    title: string;
    summary: string;
    relatedActionIds?: string[];
    score: number;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    typeLabel: string;
    entityLabel: string;
    severity: string;
    occurredAt: string;
    detail?: string | null;
    href?: string | null;
  }>;
  now?: Date;
  currentUser?: CommandCenterCurrentUser;
};

export type CommandCenterQueueResult = {
  items: CommandCenterItem[];
  emptyMessage: string;
};
