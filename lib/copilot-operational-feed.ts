import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAccionesHrefFromAlert,
  buildOperationalActionHref,
} from "@/lib/copilot-alert-ops-mapper";
import { getFinancialPredictiveAlertsForWorkspace } from "@/lib/copilot-financial-alerts";
import type {
  OperationalFeedItem,
  OperationalFeedTimelineItem,
} from "@/lib/copilot-operational-feed-types";
import {
  compareOperationalFeedScore,
  mapAlertPriorityToFeedSeverity,
  mapOperationalPriorityToFeedSeverity,
  mapTreasurySeverityToFeedSeverity,
  scoreOperationalActionRow,
  scoreOperationalFeedItem,
} from "@/lib/copilot-operational-score";
import { computeCopilotRealInsights, type CopilotRealInsight } from "@/lib/copilot-real-insights";
import { getActionSlaStatus } from "@/lib/copilot-operational-actions-sla";
import type {
  OperationalActionEventRow,
  OperationalActionListItem,
} from "@/lib/copilot-operational-actions-types";
import { formatOperationalEventDetail } from "@/lib/copilot-operational-actions-format";
import { listOperationalActions } from "@/lib/copilot-operational-actions-service";
import { getFiscalAlerts, type FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import {
  selectRecentOperationalActionEventsForWorkspace,
} from "@/lib/data/operational-actions-repository";
import { treasuryAlertsOnly } from "@/lib/treasury/services/treasury-intelligence-service";
import type { TreasuryAlert } from "@/lib/treasury/treasury-alert-engine";

const OPEN_ACTION_STATUSES = new Set(["pending", "in_progress", "blocked"]);
const FEED_LIMIT = 16;
const TIMELINE_LIMIT = 12;

function alertFeedSource(alert: FiscalAlertItem): OperationalFeedItem["source"] {
  if (alert.type === "liquidez" || alert.type === "cobertura") return "finance";
  return "alert";
}

function insightSeverity(insight: CopilotRealInsight): OperationalFeedItem["severity"] {
  if (insight.type === "desbalance_caja" || insight.type === "obl_fiscal_vencida") {
    return "critical";
  }
  if (insight.type === "deuda_vencida" || insight.type === "concentracion_deuda") {
    return "high";
  }
  return "medium";
}

function insightSource(insight: CopilotRealInsight): OperationalFeedItem["source"] {
  if (insight.type === "desbalance_caja") return "finance";
  if (insight.type === "deuda_vencida" || insight.type === "atraso_historico") {
    return "customer";
  }
  return "insight";
}

function insightFinancialImpact(insight: CopilotRealInsight): number | undefined {
  if (insight.type === "deuda_vencida") return insight.evidence.amount;
  if (insight.type === "concentracion_deuda") return insight.evidence.total_overdue;
  if (insight.type === "obl_fiscal_vencida") return insight.evidence.amount;
  return undefined;
}

function mapAlertToFeedItem(alert: FiscalAlertItem): OperationalFeedItem {
  const source = alertFeedSource(alert);
  const severity = mapAlertPriorityToFeedSeverity(alert.priority);
  const score = scoreOperationalFeedItem({
    source,
    severity,
    treasuryRisk: source === "finance",
    financialImpact: alert.priority === "critical" ? 1_000 : undefined,
  });

  return {
    id: `alert:${alert.id}`,
    source,
    severity,
    score,
    title: alert.title,
    summary: alert.summary,
    cta: {
      label: "Crear seguimiento",
      href: buildAccionesHrefFromAlert(alert),
    },
    quickActions: ["open"],
    href: "/copilot/alertas",
    metadata: {
      alertId: alert.id,
      alertType: alert.type,
      obligationId: alert.obligationId,
    },
  };
}

function mapActionToFeedItem(action: OperationalActionListItem): OperationalFeedItem {
  const severity = mapOperationalPriorityToFeedSeverity(action.priority);
  const score = scoreOperationalActionRow(action);
  const blocked = action.operational_status === "blocked";
  const quickActions: OperationalFeedItem["quickActions"] = ["open", "assign_to_me", "resolve"];
  if (!blocked) quickActions.push("block");

  return {
    id: `action:${action.id}`,
    source: "action",
    severity,
    score,
    title: action.title,
    summary: action.summary ?? undefined,
    status:
      action.operational_status === "dismissed"
        ? undefined
        : action.operational_status,
    blocked,
    owner: {
      id: action.owner_id ?? undefined,
      label: action.assigned_to ?? undefined,
    },
    dueAt: action.due_at,
    cta: {
      label: "Abrir acción",
      href: buildOperationalActionHref(action.id),
    },
    quickActions,
    href: buildOperationalActionHref(action.id),
    metadata: {
      actionId: action.id,
      slaStatus: getActionSlaStatus(action),
      origin: action.origin,
      relatedEntityId: action.related_entity_id,
    },
  };
}

function mapInsightToFeedItem(insight: CopilotRealInsight): OperationalFeedItem {
  const source = insightSource(insight);
  const severity = insightSeverity(insight);
  const score = scoreOperationalFeedItem({
    source,
    severity,
    financialImpact: insightFinancialImpact(insight),
  });

  return {
    id: `insight:${insight.id}`,
    source,
    severity,
    score,
    title: insight.message,
    summary: insight.basedOnLine,
    cta: {
      label: insight.action,
      href: insight.href,
    },
    quickActions: ["open"],
    href: insight.href,
    metadata: {
      insightType: insight.type,
      companyId: insight.company_id,
    },
  };
}

function mapTreasuryAlertToFeedItem(alert: TreasuryAlert): OperationalFeedItem {
  const severity = mapTreasurySeverityToFeedSeverity(alert.severity);
  const score = scoreOperationalFeedItem({
    source: "treasury",
    severity,
    treasuryRisk: true,
  });

  return {
    id: `treasury:${alert.id}`,
    source: "treasury",
    severity,
    score,
    title: alert.title,
    summary: alert.description,
    cta: {
      label: "Ir a Tesorería",
      href: "/copilot/tesoreria",
    },
    quickActions: ["open"],
    href: "/copilot/tesoreria",
    metadata: {
      treasuryAlertType: alert.type,
      recommendation: alert.recommendation,
    },
  };
}

export async function buildOperationalFeed(
  client: SupabaseClient,
  workspaceCompanyId: string
): Promise<OperationalFeedItem[]> {
  const [fiscalAlerts, predictiveAlerts, actionsResult, insights, treasuryResult] =
    await Promise.all([
      getFiscalAlerts(client, workspaceCompanyId),
      getFinancialPredictiveAlertsForWorkspace(client, workspaceCompanyId),
      listOperationalActions(client, workspaceCompanyId, 120),
      computeCopilotRealInsights(client, workspaceCompanyId),
      treasuryAlertsOnly(client, workspaceCompanyId),
    ]);

  const alerts = [...fiscalAlerts, ...predictiveAlerts];
  const actions = actionsResult.ok ? actionsResult.data ?? [] : [];
  const treasuryAlerts = treasuryResult.ok ? treasuryResult.data ?? [] : [];

  const openActionEntityIds = new Set(
    actions
      .filter((action) => OPEN_ACTION_STATUSES.has(action.operational_status))
      .map((action) => action.related_entity_id)
      .filter((value): value is string => Boolean(value?.trim()))
  );

  const items: OperationalFeedItem[] = [];

  for (const action of actions) {
    if (!OPEN_ACTION_STATUSES.has(action.operational_status)) continue;
    items.push(mapActionToFeedItem(action));
  }

  for (const alert of alerts) {
    if (openActionEntityIds.has(alert.id)) continue;
    items.push(mapAlertToFeedItem(alert));
  }

  for (const alert of treasuryAlerts) {
    items.push(mapTreasuryAlertToFeedItem(alert));
  }

  for (const insight of insights.slice(0, 6)) {
    items.push(mapInsightToFeedItem(insight));
  }

  return items
    .sort((left, right) => compareOperationalFeedScore(left, right))
    .slice(0, FEED_LIMIT);
}

export function mapOperationalFeedTimelineItems(
  events: readonly OperationalActionEventRow[],
  actions: readonly OperationalActionListItem[],
  limit = TIMELINE_LIMIT
): OperationalFeedTimelineItem[] {
  const actionById = new Map(actions.map((action) => [action.id, action]));

  return events.slice(0, limit).map((event) => {
    const action = actionById.get(event.action_id);
    return {
      id: event.id,
      actionId: event.action_id,
      eventType: event.event_type,
      actorLabel: event.actor_label,
      actionTitle: action?.title ?? null,
      relatedEntityId: action?.related_entity_id ?? null,
      createdAt: event.created_at,
      detailSummary: formatOperationalEventDetail(event.detail),
    };
  });
}

export async function buildOperationalFeedTimeline(
  client: SupabaseClient,
  workspaceCompanyId: string,
  limit = TIMELINE_LIMIT
): Promise<OperationalFeedTimelineItem[]> {
  const [eventsResult, actionsResult] = await Promise.all([
    selectRecentOperationalActionEventsForWorkspace(client, workspaceCompanyId, limit),
    listOperationalActions(client, workspaceCompanyId, 120),
  ]);

  if (eventsResult.error) return [];

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

  return mapOperationalFeedTimelineItems(events, actions, limit);
}
