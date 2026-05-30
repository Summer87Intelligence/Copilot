import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";

export type CopilotActionType = "collection" | "treasury" | "system" | "client";
export type CopilotActionPriority = "critical" | "high" | "medium" | "low";

export type CopilotActionCollectionContext = {
  latestOutcome: string;
  latestChannel: string;
  latestDateIso: string;
  nextFollowUpAt: string | null;
  promiseDate: string | null;
  promiseAmount: number | null;
  promiseCurrency: string | null;
  isRecent: boolean;
  statusLabel: string;
};

export type CopilotAction = {
  id: string;
  type: CopilotActionType;
  priority: CopilotActionPriority;
  title: string;
  reason: string;
  amount?: number | null;
  currency?: string | null;
  entityId?: string | null;
  href: string;
  primaryActionLabel: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  source: "notification" | "portfolio";
  notificationId?: string;
  collectionContext?: CopilotActionCollectionContext | null;
};

const PRIORITY_ORDER: Record<CopilotActionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function severityToPriority(
  severity: CopilotNotification["severity"]
): CopilotActionPriority {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "high";
  return "medium";
}

function extractEntityName(body: string | null, pattern: string): string | null {
  if (!body) return null;
  const idx = body.indexOf(pattern);
  if (idx <= 0) return null;
  return body.slice(0, idx).trim() || null;
}

const SKIP_TYPES = new Set([
  "collection_received",
  "sync_changes_detected",
  "notification_digest",
  "copilot_action_suggested",
]);

export function buildActionsFromNotifications(
  notifications: CopilotNotification[]
): CopilotAction[] {
  const actions: CopilotAction[] = [];

  for (const n of notifications) {
    if (SKIP_TYPES.has(n.type)) continue;

    let type: CopilotActionType;
    let priority: CopilotActionPriority;
    let title: string;
    let reason: string;
    let primaryActionLabel: string;
    let href: string;

    switch (n.type) {
      case "client_overdue": {
        type = "collection";
        priority = severityToPriority(n.severity);
        const entityName =
          extractEntityName(n.body, " tiene ") ?? n.title;
        title = entityName;
        reason = n.body ?? n.title;
        primaryActionLabel = "Ver cliente";
        href = n.action_href ?? "/copilot/clientes";
        break;
      }
      case "treasury_payment_due": {
        type = "treasury";
        priority = severityToPriority(n.severity);
        const entityName =
          extractEntityName(n.body, " vence ") ?? n.title;
        title = entityName;
        reason = n.body ?? n.title;
        primaryActionLabel = "Ver pagos";
        href = n.action_href ?? "/copilot/tesoreria";
        break;
      }
      case "treasury_payment_overdue": {
        type = "treasury";
        priority = "critical";
        const entityName =
          extractEntityName(n.body, " está vencido") ??
          extractEntityName(n.body, " está vencida") ??
          n.title;
        title = entityName;
        reason = n.body ?? n.title;
        primaryActionLabel = "Ver pagos";
        href = n.action_href ?? "/copilot/tesoreria";
        break;
      }
      case "cash_risk_detected": {
        type = "treasury";
        priority = severityToPriority(n.severity);
        title = n.title;
        reason = n.body ?? n.title;
        primaryActionLabel = "Ver posición de caja";
        href = n.action_href ?? "/copilot/tesoreria";
        break;
      }
      case "sync_failed": {
        type = "system";
        priority = "high";
        title = n.title;
        reason = n.body ?? "Sincronización fallida — revisar integración.";
        primaryActionLabel = "Ver operacional";
        href = n.action_href ?? "/copilot/operacional";
        break;
      }
      case "new_debtor": {
        type = "collection";
        priority = "medium";
        const entityName =
          extractEntityName(n.body, " tiene ") ?? n.title;
        title = entityName;
        reason = n.body ?? n.title;
        primaryActionLabel = "Ver cliente";
        href = n.action_href ?? "/copilot/clientes";
        break;
      }
      default:
        // Unknown actionable notification — surface as medium client action
        type = "client";
        priority = severityToPriority(n.severity);
        title = n.title;
        reason = n.body ?? n.title;
        primaryActionLabel = "Ver detalle";
        href = n.action_href ?? "/copilot/hoy";
    }

    actions.push({
      id: `notif-${n.id}`,
      type,
      priority,
      title,
      reason,
      amount: n.amount,
      currency: n.currency,
      entityId: n.entity_id,
      href,
      primaryActionLabel,
      source: "notification",
      notificationId: n.id,
    });
  }

  return actions;
}

export function buildActionsFromPortfolioRows(
  rows: ClientPortfolioRow[],
  coveredEntityIds: ReadonlySet<string>
): CopilotAction[] {
  const actions: CopilotAction[] = [];

  for (const row of rows) {
    if (coveredEntityIds.has(row.company_id)) continue;

    const hasOverdueUyu = (row.overdue_uyu ?? 0) > 0;
    const hasOverdueUsd = (row.overdue_usd ?? 0) > 0;
    const hasOverdue =
      hasOverdueUyu || hasOverdueUsd || row.overdue_debt > 0;
    const hasDebt =
      row.debt_uyu > 0 || row.debt_usd > 0 || row.total_debt > 0;

    if (!hasOverdue && !hasDebt) continue;

    const priority: CopilotActionPriority =
      hasOverdue && row.risk === "Alto"
        ? "critical"
        : hasOverdue
          ? "high"
          : "medium";

    const overdueAmount = hasOverdueUyu
      ? row.overdue_uyu!
      : hasOverdueUsd
        ? row.overdue_usd!
        : row.overdue_debt;
    const currency = hasOverdueUyu ? "UYU" : hasOverdueUsd ? "USD" : undefined;

    const reason = hasOverdue
      ? `Deuda vencida de ${row.name}. Riesgo ${row.risk}.`
      : `Saldo pendiente de ${row.name}.`;

    actions.push({
      id: `portfolio-${row.company_id}`,
      type: "collection",
      priority,
      title: row.name,
      reason,
      amount: hasOverdue ? overdueAmount : row.debt_uyu || row.debt_usd || row.total_debt,
      currency: hasOverdue ? currency : row.debt_uyu > 0 ? "UYU" : row.debt_usd > 0 ? "USD" : undefined,
      entityId: row.company_id,
      href: `/copilot/clientes/${encodeURIComponent(row.company_id)}`,
      primaryActionLabel: "Ver ficha",
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      source: "portfolio",
    });
  }

  return actions;
}

export function mergePrioritizedActions(
  fromNotifications: CopilotAction[],
  fromPortfolio: CopilotAction[]
): CopilotAction[] {
  const sorted = [...fromNotifications, ...fromPortfolio].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );
  // Deduplicate by entityId: keep highest-priority (first in sorted order)
  const seenEntities = new Set<string>();
  const result: CopilotAction[] = [];
  for (const action of sorted) {
    if (action.entityId) {
      if (seenEntities.has(action.entityId)) continue;
      seenEntities.add(action.entityId);
    }
    result.push(action);
  }
  return result;
}
