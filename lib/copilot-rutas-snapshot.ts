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
import type { OperationalMemorySignal } from "@/lib/copilot-operational-memory-types";
import {
  buildOperationalNarratives,
  buildTreasuryNarrativeContext,
  type OperationalNarrativeTreasuryContext,
} from "@/lib/copilot-operational-narrative";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";
import {
  buildSnapshotHealth,
  createSnapshotWarning,
  logSnapshotObservability,
} from "@/lib/copilot-rutas-snapshot-health";
import type {
  CopilotRutasSnapshot,
  CopilotRutasSnapshotCounts,
  SnapshotHealthWarning,
} from "@/lib/copilot-rutas-snapshot-types";
import { buildStrategicRecommendations } from "@/lib/copilot-strategic-recommendations";
import type { StrategicRecommendation } from "@/lib/copilot-strategic-recommendations-types";
import { selectRecentOperationalActionEventsForWorkspace } from "@/lib/data/operational-actions-repository";
import { treasuryIntelligenceBundle } from "@/lib/treasury/services/treasury-intelligence-service";

const RUTAS_SNAPSHOT_TIMELINE_LIMIT = 5;
const SECONDARY_STAGE_TIMEOUT_MS = 2_500;

export type CopilotRutasSnapshotBuildInput = {
  actions: OperationalActionListItem[];
  events: OperationalActionEventRow[];
  feedItems: OperationalFeedItem[];
  treasury: OperationalNarrativeTreasuryContext | null;
  now: Date;
  timelineLimit?: number;
  warnings?: SnapshotHealthWarning[];
  timingMs?: CopilotRutasSnapshot["health"]["timingMs"];
  feedAvailable?: boolean;
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

function buildSnapshotCounts(
  snapshot: Omit<CopilotRutasSnapshot, "counts" | "health">
): CopilotRutasSnapshotCounts {
  return {
    feedItems: snapshot.feed.items.length,
    groups: snapshot.feed.groups.length,
    memorySignals: snapshot.memory.length,
    narratives: snapshot.narratives.length,
    recommendations: snapshot.recommendations.length,
    timelineEvents: snapshot.timeline.length,
  };
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

function runTimedStage<T>(
  source: string,
  timeoutMs: number,
  run: () => T,
  fallback: T,
  warnings: SnapshotHealthWarning[]
): Promise<{ value: T; ms: number }> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;

    const finish = (value: T, warning?: SnapshotHealthWarning) => {
      if (settled) return;
      settled = true;
      if (warning) warnings.push(warning);
      resolve({ value, ms: Date.now() - startedAt });
    };

    const timer = setTimeout(() => {
      finish(
        fallback,
        createSnapshotWarning(source, "TIMEOUT", `La fuente ${source} superó el tiempo esperado.`)
      );
    }, timeoutMs);

    queueMicrotask(() => {
      if (settled) return;
      try {
        const value = run();
        clearTimeout(timer);
        finish(value);
      } catch (error) {
        clearTimeout(timer);
        const message = error instanceof Error ? error.message : "Error desconocido";
        finish(
          fallback,
          createSnapshotWarning(source, "ERROR", `No se pudo calcular ${source}: ${message}.`)
        );
      }
    });
  });
}

export function buildCopilotRutasSnapshotFromInputs(
  input: CopilotRutasSnapshotBuildInput
): CopilotRutasSnapshot {
  const timelineLimit = input.timelineLimit ?? RUTAS_SNAPSHOT_TIMELINE_LIMIT;
  const warnings = input.warnings ?? [];
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

  const snapshotWithoutCounts: Omit<CopilotRutasSnapshot, "counts" | "health"> = {
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

  const counts = buildSnapshotCounts(snapshotWithoutCounts);
  const health = buildSnapshotHealth(warnings, {
    feedAvailable: input.feedAvailable ?? true,
    timingMs: input.timingMs,
  });

  return {
    ...snapshotWithoutCounts,
    counts,
    health,
  };
}

export async function buildCopilotRutasSnapshot(
  client: SupabaseClient,
  workspaceCompanyId: string,
  now = new Date(),
  timelineLimit = RUTAS_SNAPSHOT_TIMELINE_LIMIT
): Promise<CopilotRutasSnapshot> {
  const startedAt = Date.now();
  const warnings: SnapshotHealthWarning[] = [];
  const feedStartedAt = Date.now();
  let feedItems: OperationalFeedItem[] = [];
  let actions: OperationalActionListItem[] = [];
  let events: OperationalActionEventRow[] = [];
  let treasury: OperationalNarrativeTreasuryContext | null = null;
  let feedAvailable = false;

  const [actionsResult, eventsResult, feedResult, treasuryResult] = await Promise.allSettled([
    listOperationalActions(client, workspaceCompanyId, 120),
    selectRecentOperationalActionEventsForWorkspace(client, workspaceCompanyId, 120),
    buildOperationalFeed(client, workspaceCompanyId),
    loadTreasuryContext(client, workspaceCompanyId),
  ]);

  if (actionsResult.status === "fulfilled") {
    actions = actionsResult.value.ok ? actionsResult.value.data ?? [] : [];
    if (!actionsResult.value.ok) {
      warnings.push(
        createSnapshotWarning("actions", "UNAVAILABLE", "No se pudieron cargar las acciones operativas.")
      );
    }
  } else {
    warnings.push(
      createSnapshotWarning("actions", "ERROR", "No se pudieron cargar las acciones operativas.")
    );
  }

  if (eventsResult.status === "fulfilled") {
    if (eventsResult.value.error) {
      warnings.push(
        createSnapshotWarning("events", "UNAVAILABLE", "No se pudo cargar la actividad reciente.")
      );
    } else {
      events = mapOperationalEvents(eventsResult.value.data ?? []);
    }
  } else {
    warnings.push(
      createSnapshotWarning("events", "ERROR", "No se pudo cargar la actividad reciente.")
    );
  }

  if (feedResult.status === "fulfilled") {
    feedItems = feedResult.value;
    feedAvailable = true;
  } else {
    warnings.push(
      createSnapshotWarning("feed", "ERROR", "No se pudo construir el feed operativo principal.")
    );
  }

  if (treasuryResult.status === "fulfilled") {
    treasury = treasuryResult.value;
    if (!treasury) {
      warnings.push(
        createSnapshotWarning("treasury", "UNAVAILABLE", "No se pudo leer el contexto de tesorería.")
      );
    }
  } else {
    warnings.push(
      createSnapshotWarning("treasury", "ERROR", "No se pudo leer el contexto de tesorería.")
    );
  }

  const feedMs = Date.now() - feedStartedAt;
  if (!feedAvailable) {
    const health = buildSnapshotHealth(warnings, {
      feedAvailable: false,
      timingMs: { total: Date.now() - startedAt, feed: feedMs },
    });
    const emptySnapshot: CopilotRutasSnapshot = {
      generatedAt: now.toISOString(),
      feed: { items: [], groups: [], priorities: [] },
      timeline: [],
      memory: [],
      narratives: [],
      recommendations: [],
      counts: {
        feedItems: 0,
        groups: 0,
        memorySignals: 0,
        narratives: 0,
        recommendations: 0,
        timelineEvents: 0,
      },
      health,
    };
    logSnapshotObservability({ health, counts: emptySnapshot.counts });
    return emptySnapshot;
  }

  const grouped = buildGroupedOperationalFeed(feedItems);
  const feedGroups = [...grouped.priorities, ...grouped.groups];

  const memoryStage = await runTimedStage<OperationalMemorySignal[]>(
    "memory",
    SECONDARY_STAGE_TIMEOUT_MS,
    () =>
      buildOperationalMemorySignals({
        actions,
        events,
        feedItems,
        feedGroups,
        now,
      }),
    [],
    warnings
  );

  const narrativeStage = await runTimedStage<OperationalNarrative[]>(
    "narrative",
    SECONDARY_STAGE_TIMEOUT_MS,
    () =>
      buildOperationalNarratives({
        items: feedItems,
        priorities: grouped.priorities,
        treasury,
        finance: null,
      }),
    [],
    warnings
  );

  const recommendationsStage = await runTimedStage<StrategicRecommendation[]>(
    "recommendations",
    SECONDARY_STAGE_TIMEOUT_MS,
    () =>
      buildStrategicRecommendations(
        {
          actions,
          feedItems,
          feedGroups,
          narratives: narrativeStage.value,
          memorySignals: memoryStage.value,
          treasury,
          now,
        },
        3
      ),
    [],
    warnings
  );

  const timelineStage = await runTimedStage(
    "timeline",
    SECONDARY_STAGE_TIMEOUT_MS,
    () => mapOperationalFeedTimelineItems(events, actions, timelineLimit),
    [],
    warnings
  );

  const snapshotWithoutCounts: Omit<CopilotRutasSnapshot, "counts" | "health"> = {
    generatedAt: now.toISOString(),
    feed: {
      items: feedItems,
      groups: grouped.groups,
      priorities: grouped.priorities,
    },
    timeline: timelineStage.value,
    memory: memoryStage.value,
    narratives: narrativeStage.value,
    recommendations: recommendationsStage.value,
  };
  const counts = buildSnapshotCounts(snapshotWithoutCounts);
  const health = buildSnapshotHealth(warnings, {
    feedAvailable: true,
    timingMs: {
      total: Date.now() - startedAt,
      feed: feedMs,
      memory: memoryStage.ms,
      narrative: narrativeStage.ms,
      recommendations: recommendationsStage.ms,
      timeline: timelineStage.ms,
    },
  });
  const snapshot = {
    ...snapshotWithoutCounts,
    counts,
    health,
  };

  logSnapshotObservability({ health, counts });
  return snapshot;
}
