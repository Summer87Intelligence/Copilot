import type {
  CommandCenterCurrentUser,
  CommandCenterFilter,
  CommandCenterItem,
  CommandCenterQueueInput,
  CommandCenterQueueResult,
  CommandCenterSeverity,
  CommandCenterStatus,
} from "@/lib/copilot-command-center-types";

const RELEVANT_EVENT_TYPES = new Set([
  "workflow_blocked",
  "step_blocked",
  "action_blocked",
  "workflow_sla_breached",
  "workflow_escalated",
  "workflow_auto_completed",
  "workflow_reopened",
  "workflow_suppressed",
]);

function actionIdFromFeedItem(item: CommandCenterQueueInput["feedItems"][number]): string | null {
  const metadata = item.metadata ?? {};
  if (typeof metadata.actionId === "string") return metadata.actionId;
  if (item.id.startsWith("action:")) return item.id.slice("action:".length);
  return null;
}

function isAssignedToUser(
  ownerLabel: string | null | undefined,
  assignedUserId: string | null | undefined,
  currentUser?: CommandCenterCurrentUser
): boolean {
  if (!currentUser) return false;
  if (currentUser.id && assignedUserId && currentUser.id === assignedUserId) return true;
  const label = currentUser.label?.trim().toLowerCase();
  const owner = ownerLabel?.trim().toLowerCase();
  return Boolean(label && owner && label === owner);
}

function severityFromWorkflowType(type: string, status: string): CommandCenterSeverity {
  if (type === "critical_cash") return "critical";
  if (status === "blocked") return "high";
  if (type === "priority_collections") return "high";
  return "medium";
}

function workflowStatus(
  workflow: CommandCenterQueueInput["workflows"][number]
): CommandCenterStatus {
  if (workflow.status === "blocked") return "blocked";
  if (workflow.slaStatus === "breached") return "overdue";
  if (isAssignedToUser(workflow.ownerLabel, workflow.assignedUserId)) return "assigned";
  if (!workflow.ownerLabel && !workflow.assignedUserId) return "unassigned";
  return "active";
}

function actionStatus(item: CommandCenterQueueInput["feedItems"][number]): CommandCenterStatus {
  if (item.status === "blocked" || item.blocked) return "blocked";
  if (item.status === "resolved") return "resolved";
  if (isAssignedToUser(item.owner?.label, item.owner?.id)) return "assigned";
  if (!item.owner?.label && !item.owner?.id) return "unassigned";
  return "active";
}

function formatDueLabel(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function rankItem(item: CommandCenterItem, currentUser?: CommandCenterCurrentUser): number {
  let rank = 0;
  if (item.status === "blocked" && item.severity === "critical") rank += 1_000;
  if (item.status === "blocked") rank += 500;
  if (item.status === "overdue") rank += 400;
  if (item.metadata?.slaStatus === "breached") rank += 350;
  if (currentUser && item.status === "assigned") rank += 300;
  if (item.severity === "critical" && item.status === "unassigned") rank += 250;
  if (item.metadata?.recurring === true) rank += 200;
  if (item.type === "event") rank += 100;
  return rank;
}

export function compareCommandCenterItems(
  left: CommandCenterItem,
  right: CommandCenterItem,
  currentUser?: CommandCenterCurrentUser
): number {
  const rankDelta = rankItem(right, currentUser) - rankItem(left, currentUser);
  if (rankDelta !== 0) return rankDelta;
  const urgencyDelta = right.urgencyScore - left.urgencyScore;
  if (urgencyDelta !== 0) return urgencyDelta;
  return left.title.localeCompare(right.title, "es");
}

export function buildCommandCenterQueue(input: CommandCenterQueueInput): CommandCenterQueueResult {
  const claimedActionIds = new Set<string>();
  const items: CommandCenterItem[] = [];

  for (const workflow of input.workflows) {
    if (workflow.status !== "active" && workflow.status !== "blocked") continue;
    for (const actionId of workflow.relatedActionIds ?? []) {
      claimedActionIds.add(actionId);
    }
    items.push({
      id: `workflow:${workflow.id}`,
      type: "workflow",
      severity: severityFromWorkflowType(workflow.type, workflow.status),
      status: workflowStatus(workflow),
      title: workflow.title,
      summary: `${workflow.progressPercent}% · ${workflow.currentStepTitle ?? "Sin paso activo"}`,
      ownerLabel: workflow.ownerLabel ?? undefined,
      dueLabel: formatDueLabel(workflow.slaDueAt),
      urgencyScore: workflow.urgencyScore ?? 0,
      cta: { label: "Abrir ejecución", href: "/copilot/rutas" },
      metadata: {
        workflowId: workflow.id,
        currentStepId: workflow.currentStepId,
        workflowType: workflow.type,
        slaStatus: workflow.slaStatus,
        reopenCount: workflow.lifecycle?.reopenCount ?? 0,
        relatedCounts: workflow.relatedCounts,
        dedupeKey: workflow.dedupeKey,
        assignedUserId: workflow.assignedUserId,
      },
    });
  }

  for (const item of input.feedItems) {
    const actionId = actionIdFromFeedItem(item);
    if (!actionId || claimedActionIds.has(actionId)) continue;
    if (item.status === "resolved") continue;
    if (item.source !== "action" && item.source !== "alert") continue;
    items.push({
      id: `action:${actionId}`,
      type: "action",
      severity: item.severity,
      status: actionStatus(item),
      title: item.title,
      summary: item.summary ?? "Seguimiento operativo abierto.",
      ownerLabel: item.owner?.label,
      dueLabel: formatDueLabel(item.dueAt),
      urgencyScore: item.score,
      cta: {
        label: "Abrir seguimiento",
        href: item.href ?? `/copilot/acciones?operationalActionId=${actionId}`,
      },
      metadata: {
        actionId,
        blocked: item.blocked === true,
        source: item.source,
      },
    });
  }

  for (const signal of input.memorySignals) {
    if (signal.severity !== "critical" && signal.severity !== "high") continue;
    items.push({
      id: `memory:${signal.id}`,
      type: "memory",
      severity: signal.severity,
      status: signal.type === "recurring_issue" ? "active" : "overdue",
      title: signal.title,
      summary: signal.summary,
      urgencyScore: signal.score,
      cta: { label: "Ver memoria", href: "/copilot/rutas" },
      metadata: {
        memoryType: signal.type,
        recurring: signal.type === "recurring_issue",
        relatedActionIds: signal.relatedActionIds ?? [],
      },
    });
  }

  for (const event of input.events) {
    if (!RELEVANT_EVENT_TYPES.has(event.eventType)) continue;
    items.push({
      id: `event:${event.id}`,
      type: "event",
      severity: event.severity === "danger" ? "critical" : event.severity === "warning" ? "high" : "medium",
      status: event.eventType.includes("blocked") ? "blocked" : "active",
      title: event.entityLabel,
      summary: `${event.typeLabel}${event.detail ? ` · ${event.detail}` : ""}`,
      dueLabel: formatDueLabel(event.occurredAt),
      urgencyScore: event.eventType === "workflow_sla_breached" ? 90 : 40,
      cta: {
        label: "Abrir",
        href: event.href ?? "/copilot/rutas",
      },
      metadata: {
        eventType: event.eventType,
        occurredAt: event.occurredAt,
      },
    });
  }

  const deduped = new Map<string, CommandCenterItem>();
  for (const item of items) {
    const key =
      item.type === "workflow"
        ? `workflow:${String(item.metadata?.dedupeKey ?? item.metadata?.workflowId ?? item.id)}`
        : item.type === "action"
          ? `action:${String(item.metadata?.actionId ?? item.id)}`
          : item.id;
    const existing = deduped.get(key);
    if (!existing || existing.urgencyScore < item.urgencyScore) {
      deduped.set(key, item);
    }
  }

  const sorted = [...deduped.values()].sort((left, right) =>
    compareCommandCenterItems(left, right, input.currentUser)
  );

  return {
    items: sorted,
    emptyMessage: "Sin bloqueos ni vencimientos operativos.",
  };
}

export function filterCommandCenterItems(
  items: CommandCenterItem[],
  filter: CommandCenterFilter,
  currentUser?: CommandCenterCurrentUser
): CommandCenterItem[] {
  if (filter === "all") return items;
  return items.filter((item) => {
    if (filter === "critical") return item.severity === "critical";
    if (filter === "blocked") return item.status === "blocked";
    if (filter === "overdue") return item.status === "overdue";
    if (filter === "mine") {
      return isAssignedToUser(
        item.ownerLabel,
        typeof item.metadata?.assignedUserId === "string" ? item.metadata.assignedUserId : undefined,
        currentUser
      );
    }
    if (filter === "unassigned") return item.status === "unassigned";
    if (filter === "recurring") return item.metadata?.recurring === true;
    return true;
  });
}

export function selectCommandCenterItem(
  items: CommandCenterItem[],
  selectedId: string | null
): CommandCenterItem | null {
  if (!selectedId) return null;
  return items.find((item) => item.id === selectedId) ?? null;
}

export function moveCommandCenterSelection(
  items: CommandCenterItem[],
  selectedId: string | null,
  direction: "next" | "prev"
): string | null {
  if (items.length === 0) return null;
  const currentIndex = selectedId ? items.findIndex((item) => item.id === selectedId) : -1;
  if (currentIndex === -1) return items[0]?.id ?? null;
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + delta));
  return items[nextIndex]?.id ?? null;
}

export function commandCenterPreviewItems(
  items: CommandCenterItem[],
  limit = 8
): CommandCenterItem[] {
  return items.slice(0, limit);
}
