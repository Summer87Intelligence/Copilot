import type { SupabaseClient } from "@supabase/supabase-js";

import { buildOperationalFeed } from "@/lib/copilot-operational-feed";
import { buildGroupedOperationalFeed } from "@/lib/copilot-operational-feed-groups";
import type { OperationalFeedGroup, OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import { listOperationalActions } from "@/lib/copilot-operational-actions-service";
import { getActionSlaStatus } from "@/lib/copilot-operational-actions-sla";
import type {
  OperationalActionEventRow,
  OperationalActionListItem,
} from "@/lib/copilot-operational-actions-types";
import type {
  OperationalMemoryResponse,
  OperationalMemorySeverity,
  OperationalMemorySignal,
  OperationalMemorySignalType,
  OperationalMemorySourceCounts,
} from "@/lib/copilot-operational-memory-types";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";
import { selectRecentOperationalActionEventsForWorkspace } from "@/lib/data/operational-actions-repository";

const OPEN_STATUSES = new Set(["pending", "in_progress", "blocked"]);
const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;
const OPEN_TOO_LONG_DAYS = 3;
const STALE_ACTION_DAYS = 5;
const RESOLVED_WINDOW_HOURS = 48;
const DATE_IN_TITLE = /\b\d{4}-\d{2}-\d{2}\b/g;

export type OperationalMemoryInput = {
  actions: OperationalActionListItem[];
  events: OperationalActionEventRow[];
  feedItems: OperationalFeedItem[];
  feedGroups?: OperationalFeedGroup[];
  narratives?: OperationalNarrative[];
  now?: Date;
};

type MemoryCandidate = OperationalMemorySignal & { dedupeKey: string };

const SEVERITY_RANK: Record<OperationalMemorySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function normalizeTitleStem(title: string): string {
  return title
    .replace(DATE_IN_TITLE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isOpenAction(action: OperationalActionListItem): boolean {
  return OPEN_STATUSES.has(action.operational_status);
}

function daysBetween(startIso: string, now: Date): number {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / MS_DAY));
}

function hoursBetween(startIso: string, now: Date): number {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((now.getTime() - start.getTime()) / MS_HOUR));
}

function formatDaysLabel(days: number): string {
  return `${days} día${days === 1 ? "" : "s"}`;
}

function formatHoursLabel(hours: number): string {
  if (hours < 1) return "menos de 1 h";
  return `${hours} h`;
}

function prioritySeverity(priority: OperationalActionListItem["priority"]): OperationalMemorySeverity {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}

function candidate(
  id: string,
  type: OperationalMemorySignalType,
  severity: OperationalMemorySeverity,
  title: string,
  summary: string,
  score: number,
  options: {
    evidence: string[];
    relatedActionIds?: string[];
    relatedFeedIds?: string[];
    since?: string;
    lastSeenAt?: string;
  }
): MemoryCandidate {
  return {
    id,
    type,
    severity,
    title,
    summary,
    score,
    dedupeKey: id,
    ...options,
  };
}

function buildOpenTooLongSignals(
  actions: OperationalActionListItem[],
  now: Date
): MemoryCandidate[] {
  const signals: MemoryCandidate[] = [];

  for (const action of actions) {
    if (!isOpenAction(action)) continue;
    const daysOpen = daysBetween(action.created_at, now);
    if (daysOpen <= OPEN_TOO_LONG_DAYS) continue;

    const severity = prioritySeverity(action.priority);
    signals.push(
      candidate(
        `memory:open-too-long:${action.id}`,
        "open_too_long",
        severity === "low" ? "medium" : severity,
        `Seguimiento abierto hace ${formatDaysLabel(daysOpen)}`,
        "La acción sigue abierta sin cierre.",
        3_200 + daysOpen * 10 + (severity === "critical" ? 400 : severity === "high" ? 200 : 0),
        {
          evidence: [
            `Seguimiento: ${action.title}`,
            `Estado: ${action.operational_status}`,
            `Abierto desde ${action.created_at.slice(0, 10)}`,
          ],
          relatedActionIds: [action.id],
          since: action.created_at,
          lastSeenAt: action.updated_at,
        }
      )
    );
  }

  return signals;
}

function buildStaleActionSignals(
  actions: OperationalActionListItem[],
  now: Date
): MemoryCandidate[] {
  const signals: MemoryCandidate[] = [];

  for (const action of actions) {
    if (!isOpenAction(action)) continue;
    const daysSinceUpdate = daysBetween(action.updated_at, now);
    if (daysSinceUpdate <= STALE_ACTION_DAYS) continue;

    signals.push(
      candidate(
        `memory:stale:${action.id}`,
        "stale_action",
        prioritySeverity(action.priority),
        "Seguimiento sin movimiento reciente",
        `Sin actualización hace ${formatDaysLabel(daysSinceUpdate)}.`,
        2_600 + daysSinceUpdate * 5,
        {
          evidence: [
            `Seguimiento: ${action.title}`,
            `Última actualización ${action.updated_at.slice(0, 10)}`,
          ],
          relatedActionIds: [action.id],
          since: action.created_at,
          lastSeenAt: action.updated_at,
        }
      )
    );
  }

  return signals;
}

function buildBlockedCriticalSignals(actions: OperationalActionListItem[]): MemoryCandidate[] {
  const blocked = actions.filter(
    (action) =>
      action.operational_status === "blocked" &&
      (action.priority === "critical" || action.priority === "high")
  );
  if (blocked.length === 0) return [];

  const severity: OperationalMemorySeverity = blocked.some((action) => action.priority === "critical")
    ? "critical"
    : "high";

  return [
    candidate(
      "memory:blocked-critical",
      "open_too_long",
      severity,
      "Bloqueo crítico sigue abierto",
      "Hay seguimientos bloqueados de alta prioridad sin resolución.",
      4_000,
      {
        evidence: blocked.slice(0, 3).map((action) => `Bloqueada: ${action.title}`),
        relatedActionIds: blocked.map((action) => action.id),
        since: blocked[0]?.created_at,
        lastSeenAt: blocked[0]?.updated_at,
      }
    ),
  ];
}

function buildUnassignedSignals(actions: OperationalActionListItem[]): MemoryCandidate[] {
  const unassigned = actions.filter(
    (action) =>
      isOpenAction(action) &&
      !action.assigned_to?.trim() &&
      (action.priority === "critical" || action.priority === "high")
  );
  if (unassigned.length === 0) return [];

  return [
    candidate(
      "memory:unassigned",
      "open_too_long",
      unassigned.some((action) => action.priority === "critical") ? "critical" : "high",
      "Prioridad sin responsable",
      "Hay seguimientos críticos o altos sin dueño asignado.",
      3_100,
      {
        evidence: unassigned.slice(0, 3).map((action) => `Sin responsable: ${action.title}`),
        relatedActionIds: unassigned.map((action) => action.id),
        since: unassigned[0]?.created_at,
        lastSeenAt: unassigned[0]?.updated_at,
      }
    ),
  ];
}

function buildRecurringIssueSignals(
  feedItems: OperationalFeedItem[],
  feedGroups: OperationalFeedGroup[]
): MemoryCandidate[] {
  const grouped = feedGroups.filter((group) => group.itemCount > 1);
  if (grouped.length === 0) return [];

  const primary = grouped[0];
  const stem = normalizeTitleStem(primary.title);
  const matchingFeedItems = feedItems.filter(
    (feedItem) => normalizeTitleStem(feedItem.title) === stem
  );
  const relatedFeedItems = matchingFeedItems.length > 0 ? matchingFeedItems : primary.items;

  return [
    candidate(
      `memory:recurring:${primary.id}`,
      "recurring_issue",
      primary.severity === "critical" ? "critical" : primary.severity === "high" ? "high" : "medium",
      "Riesgo recurrente",
      "El mismo foco operativo reaparece en el seguimiento del día.",
      3_000 + primary.score,
      {
        evidence: [
          `Lectura: ${primary.title}`,
          `${relatedFeedItems.length} alertas relacionadas en el feed`,
          stem ? `Tema: ${stem}` : "Tema repetido en el feed",
        ],
        relatedFeedIds: relatedFeedItems.map((feedItem) => feedItem.id),
        since: relatedFeedItems[relatedFeedItems.length - 1]?.id,
        lastSeenAt: relatedFeedItems[0]?.id,
      }
    ),
  ];
}

function buildResolvedRecentlySignals(
  actions: OperationalActionListItem[],
  events: OperationalActionEventRow[],
  now: Date
): MemoryCandidate[] {
  const actionById = new Map(actions.map((action) => [action.id, action]));
  const resolvedEvents = events.filter((event) => event.event_type === "resolved");
  const recent = resolvedEvents.filter(
    (event) => hoursBetween(event.created_at, now) <= RESOLVED_WINDOW_HOURS
  );
  if (recent.length === 0) return [];

  const event = recent[0];
  const action = actionById.get(event.action_id);
  const hours = hoursBetween(event.created_at, now);

  return [
    candidate(
      `memory:resolved:${event.id}`,
      "resolved_recently",
      action ? prioritySeverity(action.priority) : "medium",
      `Se cerró una acción relevante hace ${formatHoursLabel(hours)}`,
      action?.title
        ? `Seguimiento cerrado: ${action.title}.`
        : "Un seguimiento operativo se resolvió en las últimas horas.",
      2_200,
      {
        evidence: [
          action?.title ? `Acción: ${action.title}` : `Acción ${event.action_id}`,
          `Resuelta ${event.created_at.slice(0, 16).replace("T", " ")}`,
        ],
        relatedActionIds: [event.action_id],
        since: event.created_at,
        lastSeenAt: event.created_at,
      }
    ),
  ];
}

function buildImprovedSignals(
  actions: OperationalActionListItem[],
  events: OperationalActionEventRow[],
  now: Date
): MemoryCandidate[] {
  const recentResolved = events.filter(
    (event) =>
      event.event_type === "resolved" && hoursBetween(event.created_at, now) <= RESOLVED_WINDOW_HOURS
  );
  if (recentResolved.length < 2) return [];

  const actionById = new Map(actions.map((action) => [action.id, action]));
  const resolvedHigh = recentResolved.filter((event) => {
    const action = actionById.get(event.action_id);
    return action?.priority === "critical" || action?.priority === "high";
  });
  if (resolvedHigh.length === 0) return [];

  return [
    candidate(
      "memory:improved",
      "improved",
      "medium",
      "La presión operativa bajó",
      "Se cerraron seguimientos relevantes en las últimas horas.",
      1_900,
      {
        evidence: resolvedHigh
          .slice(0, 3)
          .map((event) => `Cierre: ${actionById.get(event.action_id)?.title ?? event.action_id}`),
        relatedActionIds: resolvedHigh.map((event) => event.action_id),
        since: resolvedHigh[resolvedHigh.length - 1]?.created_at,
        lastSeenAt: resolvedHigh[0]?.created_at,
      }
    ),
  ];
}

function buildWorsenedSignals(
  actions: OperationalActionListItem[],
  now: Date
): MemoryCandidate[] {
  const openOverdue = actions.filter(
    (action) => isOpenAction(action) && getActionSlaStatus(action, now) === "overdue"
  );
  const recentCritical = actions.filter((action) => {
    if (!isOpenAction(action) || action.priority !== "critical") return false;
    return hoursBetween(action.created_at, now) <= RESOLVED_WINDOW_HOURS;
  });

  if (openOverdue.length >= 2) {
    return [
      candidate(
        "memory:worsened-overdue",
        "worsened",
        "high",
        "Presión operativa aumentó",
        "Hay más seguimientos vencidos abiertos.",
        2_900,
        {
          evidence: openOverdue
            .slice(0, 3)
            .map((action) => `Vencida: ${action.title}`),
          relatedActionIds: openOverdue.map((action) => action.id),
          since: openOverdue[0]?.due_at ?? openOverdue[0]?.created_at,
          lastSeenAt: openOverdue[0]?.updated_at,
        }
      ),
    ];
  }

  if (recentCritical.length > 0) {
    return [
      candidate(
        "memory:worsened-critical",
        "worsened",
        "critical",
        "Presión operativa aumentó",
        "Hay un seguimiento crítico abierto recientemente.",
        2_850,
        {
          evidence: recentCritical.map((action) => `Crítica abierta: ${action.title}`),
          relatedActionIds: recentCritical.map((action) => action.id),
          since: recentCritical[0]?.created_at,
          lastSeenAt: recentCritical[0]?.updated_at,
        }
      ),
    ];
  }

  return [];
}

function compareSignals(left: MemoryCandidate, right: MemoryCandidate): number {
  const severityDelta = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
  if (severityDelta !== 0) return severityDelta;
  if (right.score !== left.score) return right.score - left.score;
  return left.id.localeCompare(right.id);
}

export function buildOperationalMemorySignals(
  input: OperationalMemoryInput,
  limit = 8
): OperationalMemorySignal[] {
  const now = input.now ?? new Date();
  const grouped = buildGroupedOperationalFeed(input.feedItems);
  const feedGroups = input.feedGroups ?? [...grouped.priorities, ...grouped.groups];

  const candidates = [
    ...buildBlockedCriticalSignals(input.actions),
    ...buildOpenTooLongSignals(input.actions, now),
    ...buildUnassignedSignals(input.actions),
    ...buildWorsenedSignals(input.actions, now),
    ...buildRecurringIssueSignals(input.feedItems, feedGroups),
    ...buildStaleActionSignals(input.actions, now),
    ...buildResolvedRecentlySignals(input.actions, input.events, now),
    ...buildImprovedSignals(input.actions, input.events, now),
  ].filter((value): value is MemoryCandidate => value != null);

  const sorted = [...candidates].sort(compareSignals);
  const seen = new Set<string>();
  const selected: OperationalMemorySignal[] = [];

  for (const signal of sorted) {
    if (seen.has(signal.dedupeKey)) continue;
    seen.add(signal.dedupeKey);
    const { dedupeKey, ...publicSignal } = signal;
    void dedupeKey;
    selected.push(publicSignal);
    if (selected.length >= limit) break;
  }

  return selected;
}

export async function buildOperationalMemory(
  client: SupabaseClient,
  workspaceCompanyId: string,
  now = new Date()
): Promise<OperationalMemoryResponse> {
  const [actionsResult, eventsResult, feedItems] = await Promise.all([
    listOperationalActions(client, workspaceCompanyId, 120),
    selectRecentOperationalActionEventsForWorkspace(client, workspaceCompanyId, 120),
    buildOperationalFeed(client, workspaceCompanyId),
  ]);

  const actions = actionsResult.ok ? actionsResult.data ?? [] : [];
  const events = (eventsResult.data ?? []).map((row) => {
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
    } satisfies OperationalActionEventRow;
  });
  const grouped = buildGroupedOperationalFeed(feedItems);

  const sourceCounts: OperationalMemorySourceCounts = {
    actions: actions.length,
    events: events.length,
    feedItems: feedItems.length,
    narratives: 0,
  };

  const signals = buildOperationalMemorySignals({
    actions,
    events,
    feedItems,
    feedGroups: [...grouped.priorities, ...grouped.groups],
    now,
  });

  return {
    signals,
    generatedAt: now.toISOString(),
    sourceCounts,
  };
}
