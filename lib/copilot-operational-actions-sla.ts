import type {
  OperationalActionListItem,
  OperationalActionPriority,
  OperationalActionSlaStatus,
  OperationalActionSlaSummary,
  OperationalActionStatus,
} from "@/lib/copilot-operational-actions-types";

const TERMINAL_STATUSES = new Set<OperationalActionStatus>(["resolved", "dismissed"]);

const PRIORITY_RANK: Record<OperationalActionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SLA_RANK: Record<OperationalActionSlaStatus, number> = {
  overdue: 0,
  due_today: 1,
  due_soon: 2,
  ok: 3,
  no_due_date: 4,
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDueDate(dueAt: string | null): Date | null {
  if (!dueAt) return null;
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfLocalDay(parsed);
}

export function isOperationalActionTerminal(status: OperationalActionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function getActionSlaStatus(
  action: Pick<OperationalActionListItem, "due_at" | "operational_status">,
  now: Date = new Date()
): OperationalActionSlaStatus {
  if (isOperationalActionTerminal(action.operational_status)) {
    return "ok";
  }

  const dueDay = parseDueDate(action.due_at);
  if (!dueDay) return "no_due_date";

  const today = startOfLocalDay(now);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due_today";
  if (diffDays <= 7) return "due_soon";
  return "ok";
}

export function summarizeOperationalSla(
  actions: OperationalActionListItem[],
  now: Date = new Date()
): OperationalActionSlaSummary {
  return actions.reduce<OperationalActionSlaSummary>(
    (acc, action) => {
      if (isOperationalActionTerminal(action.operational_status)) {
        return acc;
      }

      const sla = getActionSlaStatus(action, now);
      if (sla === "overdue") acc.overdue += 1;
      if (sla === "due_today") acc.dueToday += 1;
      if (sla === "due_soon") acc.dueSoon += 1;
      if (sla === "no_due_date") acc.noDueDate += 1;
      if (action.operational_status === "blocked" && action.priority === "critical") {
        acc.blockedCritical += 1;
      }
      return acc;
    },
    { overdue: 0, dueToday: 0, dueSoon: 0, noDueDate: 0, blockedCritical: 0 }
  );
}

export function compareOperationalActionsForQueue(
  a: OperationalActionListItem,
  b: OperationalActionListItem,
  now: Date = new Date()
): number {
  const slaDiff = SLA_RANK[getActionSlaStatus(a, now)] - SLA_RANK[getActionSlaStatus(b, now)];
  if (slaDiff !== 0) return slaDiff;

  const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  const createdDiff = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;

  return a.id.localeCompare(b.id);
}

export function sortOperationalActionsForQueue(
  actions: OperationalActionListItem[],
  now: Date = new Date()
): OperationalActionListItem[] {
  return [...actions].sort((a, b) => compareOperationalActionsForQueue(a, b, now));
}
