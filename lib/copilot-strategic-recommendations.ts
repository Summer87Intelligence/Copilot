import type { SupabaseClient } from "@supabase/supabase-js";

import { buildOperationalFeed } from "@/lib/copilot-operational-feed";
import { buildGroupedOperationalFeed } from "@/lib/copilot-operational-feed-groups";
import type { OperationalFeedGroup, OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import { listOperationalActions } from "@/lib/copilot-operational-actions-service";
import { getActionSlaStatus } from "@/lib/copilot-operational-actions-sla";
import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";
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
import type {
  StrategicRecommendation,
  StrategicRecommendationCategory,
  StrategicRecommendationPriority,
  StrategicRecommendationsResponse,
} from "@/lib/copilot-strategic-recommendations-types";
import { selectRecentOperationalActionEventsForWorkspace } from "@/lib/data/operational-actions-repository";
import type { OperationalActionEventRow } from "@/lib/copilot-operational-actions-types";
import { treasuryIntelligenceBundle } from "@/lib/treasury/services/treasury-intelligence-service";

const OPEN_STATUSES = new Set(["pending", "in_progress", "blocked"]);

export type StrategicRecommendationsInput = {
  actions: OperationalActionListItem[];
  feedItems: OperationalFeedItem[];
  feedGroups?: OperationalFeedGroup[];
  narratives: OperationalNarrative[];
  memorySignals: OperationalMemorySignal[];
  treasury?: OperationalNarrativeTreasuryContext | null;
  now?: Date;
};

type RecommendationCandidate = StrategicRecommendation & { dedupeKey: string };

const PRIORITY_RANK: Record<StrategicRecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isOpenAction(action: OperationalActionListItem): boolean {
  return OPEN_STATUSES.has(action.operational_status);
}

function overlapsNarrative(
  recommendation: Pick<StrategicRecommendation, "title" | "rationale">,
  narrative: OperationalNarrative
): boolean {
  const title = normalizeText(recommendation.title);
  const rationale = normalizeText(recommendation.rationale);
  return (
    title === normalizeText(narrative.title) ||
    rationale === normalizeText(narrative.cause) ||
    rationale === normalizeText(narrative.recommendation)
  );
}

function candidate(
  id: string,
  priority: StrategicRecommendationPriority,
  category: StrategicRecommendationCategory,
  title: string,
  rationale: string,
  expectedImpact: string,
  unlocks: string,
  timeframe: StrategicRecommendation["timeframe"],
  score: number,
  options: {
    cta?: StrategicRecommendation["cta"];
    relatedActionIds?: string[];
    relatedNarrativeIds?: string[];
    relatedMemoryIds?: string[];
    dedupeKey?: string;
  } = {}
): RecommendationCandidate {
  return {
    id,
    priority,
    category,
    title,
    rationale,
    expectedImpact,
    unlocks,
    timeframe,
    score,
    dedupeKey: options.dedupeKey ?? id,
    cta: options.cta,
    relatedActionIds: options.relatedActionIds,
    relatedNarrativeIds: options.relatedNarrativeIds,
    relatedMemoryIds: options.relatedMemoryIds,
  };
}

function buildCashCriticalRecommendation(
  input: StrategicRecommendationsInput
): RecommendationCandidate | null {
  const treasury = input.treasury;
  const cashNarrative = input.narratives.find(
    (narrative) => narrative.id === "narrative:cash-critical" || narrative.category === "cashflow"
  );
  const hasCriticalCash =
    (treasury?.runwayDays === 0 && treasury.riskLevel === "critical") ||
    cashNarrative?.severity === "critical";

  if (!hasCriticalCash) return null;

  return candidate(
    "strategic:cash-critical",
    "critical",
    "cashflow",
    "Priorizar cobranza y pagos críticos",
    "La caja queda bajo presión inmediata con runway en cero.",
    "Recupera margen de liquidez en los próximos días.",
    "Priorizar cobranza y revisar pagos no críticos.",
    "today",
    4_500,
    {
      cta: { label: "Ir a Tesorería", href: "/copilot/tesoreria" },
      relatedNarrativeIds: cashNarrative ? [cashNarrative.id] : undefined,
      dedupeKey: "cashflow:critical",
    }
  );
}

function buildBlockedOverdueRecommendation(
  input: StrategicRecommendationsInput,
  now: Date
): RecommendationCandidate | null {
  const blocked = input.actions.filter(
    (action) => action.operational_status === "blocked" && isOpenAction(action)
  );
  const overdue = input.actions.filter(
    (action) => isOpenAction(action) && getActionSlaStatus(action, now) === "overdue"
  );
  if (blocked.length === 0 && overdue.length === 0) return null;

  const relatedIds = [...blocked, ...overdue].map((action) => action.id);
  const priority: StrategicRecommendationPriority =
    blocked.some((action) => action.priority === "critical") || overdue.length >= 2
      ? "critical"
      : "high";

  return candidate(
    "strategic:unblock-followups",
    priority,
    "operations",
    "Desbloquear seguimientos antes de abrir nuevas tareas",
    "Hay acciones vencidas o bloqueadas que mantienen el riesgo abierto.",
    "Libera capacidad operativa para cerrar prioridades reales.",
    "Resolver bloqueos y vencimientos antes de sumar nuevas acciones.",
    "today",
    4_000,
    {
      cta: { label: "Abrir cola", href: "/copilot/acciones" },
      relatedActionIds: relatedIds,
      dedupeKey: "operations:blocked-overdue",
    }
  );
}

function buildRecurringRootCauseRecommendation(
  input: StrategicRecommendationsInput
): RecommendationCandidate | null {
  const recurringMemory = input.memorySignals.find((signal) => signal.type === "recurring_issue");
  const recurringGroup = (input.feedGroups ?? []).find((group) => group.itemCount > 1);
  if (!recurringMemory && !recurringGroup) return null;

  return candidate(
    "strategic:recurring-root-cause",
    recurringMemory?.severity === "critical" ? "critical" : "high",
    "risk",
    "Resolver la causa raíz del riesgo recurrente",
    "El mismo foco operativo reaparece en la lectura del día.",
    "Evita repetir el mismo incidente en el seguimiento diario.",
    "Atacar la causa raíz antes de cerrar casos aislados.",
    "this_week",
    3_400,
    {
      cta: { label: "Ver seguimiento", href: "/copilot/acciones" },
      relatedMemoryIds: recurringMemory ? [recurringMemory.id] : undefined,
      relatedNarrativeIds: undefined,
      dedupeKey: "risk:recurring",
    }
  );
}

function buildRecentClosureRecommendation(
  input: StrategicRecommendationsInput
): RecommendationCandidate | null {
  const resolved = input.memorySignals.find((signal) => signal.type === "resolved_recently");
  const improved = input.memorySignals.find((signal) => signal.type === "improved");
  const signal = improved ?? resolved;
  if (!signal) return null;

  return candidate(
    "strategic:consolidate-improvement",
    "medium",
    "opportunity",
    "Consolidar la mejora reciente",
    "Se cerraron seguimientos relevantes en las últimas horas.",
    "Confirma que el impacto operativo se sostenga en caja y cola.",
    "Consolidar mejora y verificar impacto en tesorería y acciones.",
    "this_week",
    2_200,
    {
      cta: { label: "Abrir cola", href: "/copilot/acciones" },
      relatedMemoryIds: [signal.id],
      relatedActionIds: signal.relatedActionIds,
      dedupeKey: "opportunity:improved",
    }
  );
}

function buildUnassignedRecommendation(
  input: StrategicRecommendationsInput
): RecommendationCandidate | null {
  const memorySignal = input.memorySignals.find((signal) =>
    signal.title.includes("sin responsable")
  );
  const unassigned = input.actions.filter(
    (action) =>
      isOpenAction(action) &&
      !action.assigned_to?.trim() &&
      (action.priority === "critical" || action.priority === "high")
  );
  if (!memorySignal && unassigned.length === 0) return null;

  return candidate(
    "strategic:assign-owner",
    unassigned.some((action) => action.priority === "critical") ? "critical" : "high",
    "operations",
    "Asignar dueño a prioridades abiertas",
    "Hay seguimientos críticos o altos sin responsable claro.",
    "Acelera el cierre y evita que el riesgo quede sin dueño.",
    "Asignar responsable hoy y fijar fecha de cierre.",
    "today",
    3_200,
    {
      cta: { label: "Abrir cola", href: "/copilot/acciones" },
      relatedActionIds: unassigned.map((action) => action.id),
      relatedMemoryIds: memorySignal ? [memorySignal.id] : undefined,
      dedupeKey: "operations:unassigned",
    }
  );
}

function buildMaintenanceRecommendation(): RecommendationCandidate {
  return candidate(
    "strategic:maintenance",
    "medium",
    "opportunity",
    "Mantener monitoreo activo",
    "No hay presión crítica abierta en esta lectura.",
    "Se preserva estabilidad operativa sin nuevas urgencias.",
    "Mantener monitoreo y revisar tesorería semanal.",
    "this_week",
    500,
    {
      cta: { label: "Ver Tesorería", href: "/copilot/tesoreria" },
      dedupeKey: "opportunity:maintenance",
    }
  );
}

function compareRecommendations(
  left: RecommendationCandidate,
  right: RecommendationCandidate
): number {
  const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
  if (priorityDelta !== 0) return priorityDelta;
  if (right.score !== left.score) return right.score - left.score;
  return left.id.localeCompare(right.id);
}

export function buildStrategicRecommendations(
  input: StrategicRecommendationsInput,
  limit = 3
): StrategicRecommendation[] {
  const now = input.now ?? new Date();
  const grouped = buildGroupedOperationalFeed(input.feedItems);
  const feedGroups = input.feedGroups ?? [...grouped.priorities, ...grouped.groups];

  const candidates = [
    buildCashCriticalRecommendation(input),
    buildBlockedOverdueRecommendation(input, now),
    buildRecurringRootCauseRecommendation({ ...input, feedGroups }),
    buildUnassignedRecommendation(input),
    buildRecentClosureRecommendation(input),
  ].filter((value): value is RecommendationCandidate => value != null);

  const filtered = candidates.filter(
    (recommendation) =>
      !input.narratives.some((narrative) => overlapsNarrative(recommendation, narrative))
  );

  const sorted = [...filtered].sort(compareRecommendations);
  const seen = new Set<string>();
  const selected: StrategicRecommendation[] = [];

  for (const recommendation of sorted) {
    if (seen.has(recommendation.dedupeKey)) continue;
    seen.add(recommendation.dedupeKey);
    const { dedupeKey, ...publicRecommendation } = recommendation;
    void dedupeKey;
    selected.push(publicRecommendation);
    if (selected.length >= limit) break;
  }

  if (selected.length === 0) {
    const maintenance = buildMaintenanceRecommendation();
    const { dedupeKey, ...publicRecommendation } = maintenance;
    void dedupeKey;
    return [publicRecommendation];
  }

  return selected;
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

export async function buildStrategicRecommendationsForWorkspace(
  client: SupabaseClient,
  workspaceCompanyId: string,
  now = new Date()
): Promise<StrategicRecommendationsResponse> {
  const [actionsResult, eventsResult, feedItems, treasury] = await Promise.all([
    listOperationalActions(client, workspaceCompanyId, 120),
    selectRecentOperationalActionEventsForWorkspace(client, workspaceCompanyId, 120),
    buildOperationalFeed(client, workspaceCompanyId),
    loadTreasuryContext(client, workspaceCompanyId),
  ]);

  const actions = actionsResult.ok ? actionsResult.data ?? [] : [];
  const events = mapOperationalEvents(eventsResult.data ?? []);
  const grouped = buildGroupedOperationalFeed(feedItems);
  const feedGroups = [...grouped.priorities, ...grouped.groups];

  const memoryInput: OperationalMemoryInput = {
    actions,
    events,
    feedItems,
    feedGroups,
    now,
  };
  const memorySignals = buildOperationalMemorySignals(memoryInput);
  const narratives = buildOperationalNarratives({
    items: feedItems,
    priorities: grouped.priorities,
    treasury,
    finance: null,
  });

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

  return {
    recommendations,
    generatedAt: now.toISOString(),
  };
}
