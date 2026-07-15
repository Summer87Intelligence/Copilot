import { canReadModule, type ModuleKey } from "@/lib/auth/module-permissions";
import type {
  DailyTask,
  DailyTaskPriority,
  DailyTaskStatus,
} from "@/lib/daily-tasks/daily-tasks-types";
import { isTaskDueToday, isTaskOverdue } from "@/lib/tasks/task-status";
import { isTaskAdmin, type TaskViewer } from "@/lib/tasks/task-visibility";

export const UNIFIED_TASK_TABS = [
  "priority",
  "today",
  "overdue",
  "recommended",
  "in_progress",
  "completed",
  "all",
  "unassigned",
] as const;

export type UnifiedTaskTab = (typeof UNIFIED_TASK_TABS)[number];

export const UNIFIED_TASK_TAB_LABELS: Record<UnifiedTaskTab, string> = {
  priority: "Prioridad",
  today: "Para hoy",
  overdue: "Atrasadas",
  recommended: "Recomendadas",
  in_progress: "En progreso",
  completed: "Completadas",
  all: "Todas",
  unassigned: "Sin asignar",
};

export const UNIFIED_ADMIN_ONLY_TABS: readonly UnifiedTaskTab[] = ["all", "unassigned"];

export type UnifiedTaskStatus =
  | "recommended"
  | "pending"
  | "in_progress"
  | "completed"
  | "postponed"
  | "cancelled";

export type UnifiedTaskSource = "manual" | "assigned" | "system" | "automatic";

export type TaskRecommendation = {
  stableKey: string;
  workspaceId: string;
  moduleKey: ModuleKey;
  title: string;
  description: string;
  reason: string;
  priority: Exclude<DailyTaskPriority, "critical">;
  dueDate?: string | null;
  sourceType: string;
  sourceId?: string | null;
  actionUrl?: string | null;
  suggestedAssigneeUserId?: string | null;
  generatedAt: string;
  businessDate: string;
  originLabel: string;
  entityLabel?: string | null;
  confidence?: number;
  impact?: {
    bucket?: "none" | "low" | "medium" | "high";
    currencies?: Partial<Record<"UYU" | "USD", number>>;
    overdueDays?: number | null;
  };
};

export type UnifiedTaskItem = {
  id: string;
  kind: "task" | "recommendation";
  title: string;
  description?: string | null;
  reason?: string | null;
  moduleKey: string;
  moduleLabel: string;
  priority: DailyTaskPriority;
  status: UnifiedTaskStatus;
  dueDate?: string | null;
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  actionUrl?: string | null;
  sourceLabel: string;
  entityLabel?: string | null;
  isAutomatic: boolean;
  isRecommended: boolean;
  isPersisted: boolean;
  stableKey: string;
  task?: DailyTask;
  recommendation?: TaskRecommendation;
  score: number;
  urgencyLabel: "Atender ahora" | "Prioridad alta" | "Para hoy" | "Próximamente" | "Cerrada";
};

export type UnifiedTaskSummary = {
  pending: number;
  inProgress: number;
  overdue: number;
  dueToday: number;
  recommended: number;
  unassigned?: number;
};

export type UnifiedTaskFilters = {
  tab?: UnifiedTaskTab;
  search?: string;
  module?: string;
  priority?: string;
  status?: string;
  source?: string;
  assignee?: string;
  page?: number;
  pageSize?: number;
};

export type UnifiedTaskFeedResult = {
  items: UnifiedTaskItem[];
  summary: UnifiedTaskSummary;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    viewerId: string;
    isAdmin: boolean;
  };
};

const MODULE_LABELS: Record<string, string> = {
  hoy: "Alertas",
  clientes: "Clientes",
  cartera: "Cartera",
  cobranza: "Cobranza",
  tesoreria: "Tesorería",
  finanzas: "Finanzas",
  datos: "Datos",
  bank_movements: "Banco",
  manual: "General",
  daily_tasks: "Tareas",
};

const PRIORITY_WEIGHT: Record<DailyTaskPriority, number> = {
  critical: 900,
  high: 700,
  medium: 420,
  low: 160,
};

export function visibleUnifiedTabs(isAdmin: boolean): UnifiedTaskTab[] {
  return UNIFIED_TASK_TABS.filter((tab) => isAdmin || !UNIFIED_ADMIN_ONLY_TABS.includes(tab));
}

export function canReceiveModuleRecommendation(viewer: TaskViewer, moduleKey: ModuleKey): boolean {
  if (isTaskAdmin(viewer)) return true;
  return (
    canReadModule(viewer.role, viewer.permissions, "daily_tasks") &&
    canReadModule(viewer.role, viewer.permissions, moduleKey)
  );
}

function ymd(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

function metadataOf(task: DailyTask): Record<string, unknown> {
  return task.metadata && typeof task.metadata === "object" ? task.metadata : {};
}

export function stableKeyForTask(task: DailyTask): string {
  const meta = metadataOf(task);
  const explicit = meta.stableKey ?? meta.stable_key;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (task.task_key) return task.task_key;
  if (task.source_type && task.source_id) return `${task.source_type}:${task.source_id}`;
  return `task:${task.id}`;
}

function taskSourceLabel(task: DailyTask, viewerId: string): string {
  if (task.source_type === "auto" || task.task_key) return "Automática";
  if (task.assigned_to_user_id && task.assigned_to_user_id !== task.created_by_user_id) return "Asignada";
  if (task.created_by_user_id === viewerId) return "Manual";
  return "Manual";
}

function normalizedStatus(status: DailyTaskStatus): UnifiedTaskStatus {
  if (status === "done") return "completed";
  return status;
}

function itemStatusForDate(item: UnifiedTaskItem): Pick<DailyTask, "due_date" | "status"> {
  const status: DailyTaskStatus =
    item.status === "completed" ? "done" : item.status === "recommended" ? "pending" : item.status;
  return { due_date: item.dueDate ?? null, status };
}

export function scoreUnifiedTaskItem(item: Omit<UnifiedTaskItem, "score" | "urgencyLabel">, todayYmd: string): number {
  const status = itemStatusForDate(item as UnifiedTaskItem);
  const overdue = isTaskOverdue(status, todayYmd);
  const dueToday = isTaskDueToday(status, todayYmd);
  const overdueDays =
    item.recommendation?.impact?.overdueDays ??
    (item.dueDate && item.dueDate < todayYmd
      ? Math.min(90, Math.max(0, Math.ceil((Date.parse(`${todayYmd}T00:00:00Z`) - Date.parse(`${item.dueDate}T00:00:00Z`)) / 86_400_000)))
      : 0);
  const impactBucket = item.recommendation?.impact?.bucket;
  const impactWeight =
    impactBucket === "high" ? 180 : impactBucket === "medium" ? 110 : impactBucket === "low" ? 50 : 0;
  const assignedWeight = item.assignedToUserId ? 80 : 0;
  const recommendedWeight = item.kind === "recommendation" ? 45 : 0;
  const inProgressWeight = item.status === "in_progress" ? 120 : 0;
  const closedPenalty = item.status === "completed" || item.status === "cancelled" ? -1200 : 0;

  return (
    PRIORITY_WEIGHT[item.priority] +
    (overdue ? 260 : 0) +
    (dueToday ? 180 : 0) +
    Math.min(160, overdueDays * 4) +
    impactWeight +
    assignedWeight +
    recommendedWeight +
    inProgressWeight +
    Math.round((item.recommendation?.confidence ?? 0.7) * 30) +
    closedPenalty
  );
}

function urgencyLabel(score: number, status: UnifiedTaskStatus, dueToday: boolean): UnifiedTaskItem["urgencyLabel"] {
  if (status === "completed" || status === "cancelled") return "Cerrada";
  if (score >= 900) return "Atender ahora";
  if (score >= 700) return "Prioridad alta";
  if (dueToday) return "Para hoy";
  return "Próximamente";
}

export function dailyTaskToUnifiedItem(task: DailyTask, todayYmd: string, viewerId: string): UnifiedTaskItem {
  const stableKey = stableKeyForTask(task);
  const base: Omit<UnifiedTaskItem, "score" | "urgencyLabel"> = {
    id: task.id,
    kind: "task",
    title: task.title,
    description: task.description,
    reason: task.description,
    moduleKey: task.module_key,
    moduleLabel: MODULE_LABELS[task.module_key] ?? task.module_key,
    priority: task.priority,
    status: normalizedStatus(task.status),
    dueDate: ymd(task.due_date),
    assignedToUserId: task.assigned_to_user_id,
    createdByUserId: task.created_by_user_id ?? null,
    sourceType: task.source_type,
    sourceId: task.source_id,
    actionUrl: task.action_url,
    sourceLabel: taskSourceLabel(task, viewerId),
    entityLabel: typeof metadataOf(task).entityLabel === "string" ? String(metadataOf(task).entityLabel) : null,
    isAutomatic: task.source_type === "auto" || !!task.task_key,
    isRecommended: false,
    isPersisted: true,
    stableKey,
    task,
  };
  const score = scoreUnifiedTaskItem(base, todayYmd);
  return { ...base, score, urgencyLabel: urgencyLabel(score, base.status, isTaskDueToday(task, todayYmd)) };
}

export function recommendationToUnifiedItem(rec: TaskRecommendation, todayYmd: string): UnifiedTaskItem {
  const dueProbe: Pick<DailyTask, "due_date" | "status"> = { due_date: rec.dueDate ?? rec.businessDate, status: "pending" };
  const base: Omit<UnifiedTaskItem, "score" | "urgencyLabel"> = {
    id: rec.stableKey,
    kind: "recommendation",
    title: rec.title,
    description: rec.description,
    reason: rec.reason,
    moduleKey: rec.moduleKey,
    moduleLabel: MODULE_LABELS[rec.moduleKey] ?? rec.moduleKey,
    priority: rec.priority,
    status: "recommended",
    dueDate: rec.dueDate ?? rec.businessDate,
    assignedToUserId: rec.suggestedAssigneeUserId ?? null,
    createdByUserId: null,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId ?? null,
    actionUrl: rec.actionUrl ?? null,
    sourceLabel: "Recomendada por el sistema",
    entityLabel: rec.entityLabel ?? null,
    isAutomatic: false,
    isRecommended: true,
    isPersisted: false,
    stableKey: rec.stableKey,
    recommendation: rec,
  };
  const score = scoreUnifiedTaskItem(base, todayYmd);
  return { ...base, score, urgencyLabel: urgencyLabel(score, base.status, isTaskDueToday(dueProbe, todayYmd)) };
}

function activeTaskKeys(tasks: readonly DailyTask[]): Set<string> {
  const keys = new Set<string>();
  for (const task of tasks) {
    if (task.status === "pending" || task.status === "in_progress" || task.status === "postponed") {
      keys.add(stableKeyForTask(task));
    }
  }
  return keys;
}

function isDismissedToday(task: DailyTask, todayYmd: string): boolean {
  if (task.status !== "cancelled") return false;
  const meta = metadataOf(task);
  const until = typeof meta.dismissedUntil === "string" ? meta.dismissedUntil.slice(0, 10) : ymd(task.due_date);
  return !!until && until >= todayYmd;
}

export function dedupeRecommendations(
  recommendations: readonly TaskRecommendation[],
  tasks: readonly DailyTask[],
  todayYmd: string
): TaskRecommendation[] {
  const active = activeTaskKeys(tasks);
  const dismissed = new Set(tasks.filter((task) => isDismissedToday(task, todayYmd)).map(stableKeyForTask));
  const seen = new Set<string>();
  const out: TaskRecommendation[] = [];
  for (const rec of recommendations) {
    if (seen.has(rec.stableKey)) continue;
    seen.add(rec.stableKey);
    if (active.has(rec.stableKey)) continue;
    if (dismissed.has(rec.stableKey)) continue;
    out.push(rec);
  }
  return out;
}

function matchesTab(item: UnifiedTaskItem, tab: UnifiedTaskTab, todayYmd: string, isAdmin: boolean): boolean {
  const probe = itemStatusForDate(item);
  switch (tab) {
    case "priority":
      return item.status !== "completed" && item.status !== "cancelled";
    case "today":
      return isTaskDueToday(probe, todayYmd);
    case "overdue":
      return isTaskOverdue(probe, todayYmd);
    case "recommended":
      return item.kind === "recommendation";
    case "in_progress":
      return item.status === "in_progress";
    case "completed":
      return item.status === "completed";
    case "unassigned":
      return isAdmin && !item.assignedToUserId && item.status !== "completed" && item.status !== "cancelled";
    case "all":
      return isAdmin;
    default:
      return true;
  }
}

export function filterUnifiedItems(
  items: readonly UnifiedTaskItem[],
  filters: UnifiedTaskFilters,
  ctx: { todayYmd: string; isAdmin: boolean }
): UnifiedTaskItem[] {
  const tab = filters.tab ?? "priority";
  const q = filters.search?.trim().toLowerCase();
  return items.filter((item) => {
    if (!matchesTab(item, tab, ctx.todayYmd, ctx.isAdmin)) return false;
    if (filters.module && filters.module !== "all" && item.moduleKey !== filters.module) return false;
    if (filters.priority && filters.priority !== "all" && item.priority !== filters.priority) return false;
    if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.source && filters.source !== "all") {
      if (filters.source === "recommendation" && item.kind !== "recommendation") return false;
      if (filters.source === "task" && item.kind !== "task") return false;
      if (filters.source === "manual" && item.sourceLabel !== "Manual") return false;
      if (filters.source === "automatic" && !item.isAutomatic) return false;
    }
    if (filters.assignee && filters.assignee !== "all") {
      if (filters.assignee === "unassigned" ? !!item.assignedToUserId : item.assignedToUserId !== filters.assignee) {
        return false;
      }
    }
    if (q) {
      const hay = `${item.title} ${item.description ?? ""} ${item.reason ?? ""} ${item.entityLabel ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function summarizeUnifiedItems(
  items: readonly UnifiedTaskItem[],
  ctx: { todayYmd: string; isAdmin: boolean }
): UnifiedTaskSummary {
  const summary: UnifiedTaskSummary = {
    pending: 0,
    inProgress: 0,
    overdue: 0,
    dueToday: 0,
    recommended: 0,
  };
  if (ctx.isAdmin) summary.unassigned = 0;
  for (const item of items) {
    const probe = itemStatusForDate(item);
    if (item.status === "pending" || item.status === "recommended") summary.pending += 1;
    if (item.status === "in_progress") summary.inProgress += 1;
    if (isTaskOverdue(probe, ctx.todayYmd)) summary.overdue += 1;
    if (isTaskDueToday(probe, ctx.todayYmd)) summary.dueToday += 1;
    if (item.kind === "recommendation") summary.recommended += 1;
    if (ctx.isAdmin && !item.assignedToUserId && item.status !== "completed" && item.status !== "cancelled") {
      summary.unassigned = (summary.unassigned ?? 0) + 1;
    }
  }
  return summary;
}

export function buildUnifiedTaskFeed(
  input: {
    tasks: DailyTask[];
    recommendations: TaskRecommendation[];
    todayYmd: string;
    viewerId: string;
    isAdmin: boolean;
    filters?: UnifiedTaskFilters;
  }
): UnifiedTaskFeedResult {
  const recs = dedupeRecommendations(input.recommendations, input.tasks, input.todayYmd);
  const allItems = [
    ...input.tasks.map((task) => dailyTaskToUnifiedItem(task, input.todayYmd, input.viewerId)),
    ...recs.map((rec) => recommendationToUnifiedItem(rec, input.todayYmd)),
  ].sort((a, b) => b.score - a.score || (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") || a.title.localeCompare(b.title, "es"));

  const filtered = filterUnifiedItems(allItems, input.filters ?? {}, {
    todayYmd: input.todayYmd,
    isAdmin: input.isAdmin,
  });
  const page = Math.max(1, input.filters?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.filters?.pageSize ?? 50));
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    summary: summarizeUnifiedItems(allItems, {
      todayYmd: input.todayYmd,
      isAdmin: input.isAdmin,
    }),
    meta: {
      page,
      pageSize,
      total: filtered.length,
      viewerId: input.viewerId,
      isAdmin: input.isAdmin,
    },
  };
}
