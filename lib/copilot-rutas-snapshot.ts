import type { SupabaseClient } from "@supabase/supabase-js";

import { listOperationalActions } from "@/lib/copilot-operational-actions-service";
import type {
  OperationalActionEventRow,
  OperationalActionListItem,
} from "@/lib/copilot-operational-actions-types";
import { buildOperationalFeed, mapOperationalFeedTimelineItems } from "@/lib/copilot-operational-feed";
import { buildGroupedOperationalFeed } from "@/lib/copilot-operational-feed-groups";
import type { OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import {
  buildOperationalMemorySignals,
  type OperationalMemoryInput,
} from "@/lib/copilot-operational-memory";
import {
  buildOperationalNarratives,
  buildTreasuryNarrativeContext,
  type OperationalNarrativeTreasuryContext,
} from "@/lib/copilot-operational-narrative";
import type {
  CopilotRutasSnapshot,
  CopilotRutasSnapshotCounts,
} from "@/lib/copilot-rutas-snapshot-types";
import { buildStrategicRecommendations } from "@/lib/copilot-strategic-recommendations";
import { selectRecentOperationalActionEventsForWorkspace } from "@/lib/data/operational-actions-repository";
import { treasuryIntelligenceBundle } from "@/lib/treasury/services/treasury-intelligence-service";

const RUTAS_SNAPSHOT_TIMELINE_LIMIT = 5;

export type CopilotRutasSnapshotBuildInput = {
  actions: OperationalActionListItem[];
  events: OperationalActionEventRow[];
  feedItems: OperationalFeedItem[];
  treasury: OperationalNarrativeTreasuryContext | null;
  now: Date;
  timelineLimit?: number;
};

type SnapshotStageTimingMs = {
  total: number;
  feed: number;
  memory: number;
  narrative: number;
  recommendations: number;
};

function mapOperationalEvents(rows: unknown[]): OperationalActionEventRow[] {
  return rows.map((row) => {
    const event = row as Record<string, unknown>;
    return {
      id: String(event.id),
      workspace_company_id: String(event.workspace_company_id),
      action_id: String(event.action_id),
      event_type: String(event.event_type),
      actor_id: event.actor_id != null ? String(event.actor_id) : null,
      actor_label: event.actor_label != null ? String(event.actor_label) : null,
      detail:
        event.detail != null && typeof event.detail === "object" && !Array.isArray(event.detail)
          ? (event.detail as Record<string, unknown>)
          : {},
      created_at: String(event.created_at),
    };
  });
}

function buildSnapshotCounts(snapshot: Omit<CopilotRutasSnapshot, "counts">): CopilotRutasSnapshotCounts {
  return {
    feedItems: snapshot.feed.items.length,
    groups: snapshot.feed.groups.length,
    memorySignals: snapshot.memory.length,
    narratives: snapshot.narratives.length,
    recommendations: snapshot.recommendations.length,
    timelineEvents: snapshot.timeline.length,
  };
}

function logSnapshotTiming(timing: SnapshotStageTimingMs, counts: CopilotRutasSnapshotCounts): void {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[copilot-rutas-snapshot]", {
    timingMs: timing,
    counts,
  });
}

async function loadTreasuryContext(
  client: SupabaseClient,
  tenantCompanyId: string
): Promise<OperationalNarrativeTreasuryContext | null> {
  const bundle = await treasuryIntelligenceBundle(client, tenantCompanyId, { horizonDays: 30 });
  if (!bundle.ok || !bundle.data) return null;

  const { projection, alerts } = bundle.data;
  return buildTreasuryNarrativeContext({
    projection: {
      runwayDays: projection.runwayDays,
      riskLevel: projection.riskLevel,
      snapshots: projection.snapshots,
    },
    upcoming7: alerts,
    criticalAlertCount: alerts.filter((alert) => alert.severity === "critical").length,
    warningAlertCount: alerts.filter((alert) => alert.severity === "warning").length,
  });
}

export function buildCopilotRutasSnapshotFromInputs(
  input: CopilotRutasSnapshotBuildInput
): CopilotRutasSnapshot {
  const timelineLimit = input.timelineLimit ?? RUTAS_SNAPSHOT_TIMELINE_LIMIT;
  const grouped = buildGroupedOperationalFeed(input.feedItems);
  const feedGroups = [...grouped.priorities, ...grouped.groups];

  const memoryInput: OperationalMemoryInput = {
    actions: input.actions,
    events: input.events,
    feedItems: input.feedItems,
    feedGroups,
    now: input.now,
  };
  const memorySignals = buildOperationalMemorySignals(memoryInput);
  const narratives = buildOperationalNarratives({
    items: input.feedItems,
    priorities: grouped.priorities,
    treasury: input.treasury,
    finance: null,
  });
  const recommendations = buildStrategicRecommendations(
    {
      actions: input.actions,
      feedItems: input.feedItems,
      feedGroups,
      narratives,
      memorySignals,
      treasury: input.treasury,
      now: input.now,
    },
    3
  );
  const timeline = mapOperationalFeedTimelineItems(input.events, input.actions, timelineLimit);

  const snapshotWithoutCounts: Omit<CopilotRutasSnapshot, "counts"> = {
    generatedAt: input.now.toISOString(),
    feed: {
      items: input.feedItems,
      groups: grouped.groups,
      priorities: grouped.priorities,
    },
    timeline,
    memory: memorySignals,
    narratives,
    recommendations,
  };

  return {
    ...snapshotWithoutCounts,
    counts: buildSnapshotCounts(snapshotWithoutCounts),
  };
}

export async function buildCopilotRutasSnapshot(
  client: SupabaseClient,
  workspaceCompanyId: string,
  now = new Date(),
  timelineLimit = RUTAS_SNAPSHOT_TIMELINE_LIMIT
): Promise<CopilotRutasSnapshot> {
  const startedAt = Date.now();
  const feedStartedAt = Date.now();
  const [actionsResult, eventsResult, feedItems, treasury] = await Promise.all([
    listOperationalActions(client, workspaceCompanyId, 120),
    selectRecentOperationalActionEventsForWorkspace(client, workspaceCompanyId, 120),
    buildOperationalFeed(client, workspaceCompanyId),
    loadTreasuryContext(client, workspaceCompanyId),
  ]);
  const feedMs = Date.now() - feedStartedAt;

  const actions = actionsResult.ok ? actionsResult.data ?? [] : [];
  const events = mapOperationalEvents(eventsResult.data ?? []);
  const grouped = buildGroupedOperationalFeed(feedItems);
  const feedGroups = [...grouped.priorities, ...grouped.groups];

  const memoryStartedAt = Date.now();
  const memorySignals = buildOperationalMemorySignals({
    actions,
    events,
    feedItems,
    feedGroups,
    now,
  });
  const memoryMs = Date.now() - memoryStartedAt;

  const narrativeStartedAt = Date.now();
  const narratives = buildOperationalNarratives({
    items: feedItems,
    priorities: grouped.priorities,
    treasury,
    finance: null,
  });
  const narrativeMs = Date.now() - narrativeStartedAt;

  const recommendationsStartedAt = Date.now();
  const recommendations = buildStrategicRecommendations(
    {
      actions,
      feedItems,
      feedGroups,
      narratives,
      memorySignals,
      treasury,
      now,
    },
    3
  );
  const recommendationsMs = Date.now() - recommendationsStartedAt;

  const timeline = mapOperationalFeedTimelineItems(events, actions, timelineLimit);
  const snapshotWithoutCounts: Omit<CopilotRutasSnapshot, "counts"> = {
    generatedAt: now.toISOString(),
    feed: {
      items: feedItems,
      groups: grouped.groups,
      priorities: grouped.priorities,
    },
    timeline,
    memory: memorySignals,
    narratives,
    recommendations,
  };
  const snapshot = {
    ...snapshotWithoutCounts,
    counts: buildSnapshotCounts(snapshotWithoutCounts),
  };

  logSnapshotTiming(
    {
      total: Date.now() - startedAt,
      feed: feedMs,
      memory: memoryMs,
      narrative: narrativeMs,
      recommendations: recommendationsMs,
    },
    snapshot.counts
  );

  return snapshot;
}
