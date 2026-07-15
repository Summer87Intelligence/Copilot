import type { SupabaseClient } from "@supabase/supabase-js";

import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { listNotifications } from "@/lib/copilot-notifications/notification-service";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { getAllPipelineHealth } from "@/lib/data/zeta-pipeline-health";
import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import { buildTaskViewer } from "@/lib/tasks/task-viewer.server";
import {
  augmentWriteWithFase7,
  hydrateTaskRow,
  hydrateTaskRows,
  isMissingTableError,
  isUndefinedColumnError,
  stripFase7Columns,
} from "@/lib/tasks/task-row";
import { createdEntry, diffTaskChanges, recordTaskHistory } from "@/lib/tasks/task-history";
import { filterVisibleTasks, isTaskAdmin, type TaskViewer } from "@/lib/tasks/task-visibility";
import {
  buildAlertRecommendations,
  buildClientesRecommendations,
  buildCobranzaRecommendations,
  buildDataRecommendations,
} from "@/lib/tasks/task-recommendations";
import {
  buildUnifiedTaskFeed,
  canReceiveModuleRecommendation,
  type TaskRecommendation,
  type UnifiedTaskFeedResult,
  type UnifiedTaskFilters,
} from "@/lib/tasks/unified-task-feed";
import type { AppUser } from "@/types/app-user";

export type UnifiedTaskFeedContext = {
  supabase: SupabaseClient;
  workspaceId: string;
  appUser: AppUser;
};

export type RecommendationAction = "claim" | "start" | "dismiss" | "materialize";

export type RecommendationActionResult =
  | { ok: true; task: DailyTask | null }
  | { ok: false; status: number; error: string };

async function loadVisibleTasks(
  supabase: SupabaseClient,
  workspaceId: string,
  viewer: TaskViewer
): Promise<{ tasks: DailyTask[]; migrationPending: boolean }> {
  const { data, error } = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    if (isMissingTableError(error)) return { tasks: [], migrationPending: true };
    throw error;
  }

  const hydrated = hydrateTaskRows((data ?? []) as Record<string, unknown>[]);
  return { tasks: filterVisibleTasks(hydrated, viewer), migrationPending: false };
}

async function buildRecommendations(
  ctx: UnifiedTaskFeedContext,
  viewer: TaskViewer,
  todayYmd: string
): Promise<TaskRecommendation[]> {
  const generatedAt = new Date().toISOString();
  const recommendations: TaskRecommendation[] = [];
  const needsPortfolio =
    canReceiveModuleRecommendation(viewer, "cobranza") ||
    canReceiveModuleRecommendation(viewer, "clientes");

  if (needsPortfolio) {
    try {
      const portfolio = await getClientPortfolio(ctx.supabase, ctx.workspaceId);
      if (canReceiveModuleRecommendation(viewer, "cobranza")) {
        recommendations.push(
          ...buildCobranzaRecommendations({
            workspaceId: ctx.workspaceId,
            rows: portfolio.rows,
            generatedAt,
            businessDate: todayYmd,
          })
        );
      }
      if (canReceiveModuleRecommendation(viewer, "clientes")) {
        recommendations.push(
          ...buildClientesRecommendations({
            workspaceId: ctx.workspaceId,
            rows: portfolio.rows,
            generatedAt,
            businessDate: todayYmd,
          })
        );
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[tasks-feed] portfolio recommendations skipped:", error);
      }
    }
  }

  if (canReceiveModuleRecommendation(viewer, "hoy")) {
    try {
      const result = await listNotifications(ctx.supabase, ctx.workspaceId, {
        limit: 50,
        unreadOnly: true,
      });
      recommendations.push(
        ...buildAlertRecommendations({
          workspaceId: ctx.workspaceId,
          notifications: result.notifications,
          generatedAt,
          businessDate: todayYmd,
        })
      );
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[tasks-feed] alert recommendations skipped:", error);
      }
    }
  }

  if (canReceiveModuleRecommendation(viewer, "datos")) {
    try {
      const health = await getAllPipelineHealth(ctx.supabase);
      recommendations.push(
        ...buildDataRecommendations({
          workspaceId: ctx.workspaceId,
          health,
          generatedAt,
          businessDate: todayYmd,
        })
      );
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[tasks-feed] data recommendations skipped:", error);
      }
    }
  }

  return recommendations;
}

export async function getUnifiedTaskFeed(
  ctx: UnifiedTaskFeedContext,
  filters: UnifiedTaskFilters = {}
): Promise<UnifiedTaskFeedResult & { migrationPending: boolean }> {
  const viewer = await buildTaskViewer(ctx.supabase, ctx.appUser);
  const todayYmd = todayYmdMontevideo();
  const { tasks, migrationPending } = await loadVisibleTasks(ctx.supabase, ctx.workspaceId, viewer);
  const recommendations = migrationPending ? [] : await buildRecommendations(ctx, viewer, todayYmd);
  return {
    ...buildUnifiedTaskFeed({
      tasks,
      recommendations,
      todayYmd,
      viewerId: viewer.userId,
      isAdmin: isTaskAdmin(viewer),
      filters,
    }),
    migrationPending,
  };
}

async function findRecommendationForAction(
  ctx: UnifiedTaskFeedContext,
  viewer: TaskViewer,
  stableKey: string,
  todayYmd: string
): Promise<TaskRecommendation | null> {
  const recs = await buildRecommendations(ctx, viewer, todayYmd);
  return recs.find((rec) => rec.stableKey === stableKey) ?? null;
}

function metadataForRecommendation(rec: TaskRecommendation, action: RecommendationAction, todayYmd: string) {
  return {
    stableKey: rec.stableKey,
    origin: rec.originLabel,
    reason: rec.reason,
    entityLabel: rec.entityLabel ?? null,
    isRecommendationMaterialized: action !== "dismiss",
    businessDate: rec.businessDate,
    dismissedUntil: action === "dismiss" ? todayYmd : null,
  };
}

async function upsertRecommendationTask(
  ctx: UnifiedTaskFeedContext,
  viewer: TaskViewer,
  rec: TaskRecommendation,
  action: RecommendationAction,
  todayYmd: string
): Promise<RecommendationActionResult> {
  const existingResult = await ctx.supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("task_key", rec.stableKey)
    .maybeSingle();

  if (existingResult.error) {
    return { ok: false, status: 500, error: "No se pudo verificar la recomendación." };
  }

  const assignedTo =
    action === "dismiss" ? null : viewer.userId;
  const status =
    action === "start" ? "in_progress" : action === "dismiss" ? "cancelled" : "pending";
  const base = {
    workspace_id: ctx.workspaceId,
    task_key: rec.stableKey,
    assigned_to_user_id: assignedTo,
    title: rec.title,
    description: rec.description,
    module_key: rec.moduleKey,
    source_type: action === "dismiss" ? "auto" : rec.sourceType,
    source_id: rec.sourceId ?? null,
    priority: rec.priority,
    status,
    due_date: action === "dismiss" ? todayYmd : rec.dueDate ?? todayYmd,
    action_url: rec.actionUrl ?? null,
    metadata: metadataForRecommendation(rec, action, todayYmd),
  };

  if (existingResult.data?.id) {
    const previous = hydrateTaskRow(existingResult.data as Record<string, unknown>);
    const patch = {
      ...base,
      updated_at: new Date().toISOString(),
      completed_at: null,
      completed_by: null,
      snoozed_until: null,
    };
    const { data, error } = await ctx.supabase
      .from("daily_tasks")
      .update(patch)
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", previous.id)
      .select("*")
      .maybeSingle();
    if (error || !data) return { ok: false, status: 500, error: "No se pudo actualizar la tarea." };
    const task = hydrateTaskRow(data as Record<string, unknown>);
    await recordTaskHistory(ctx.supabase, {
      workspaceId: ctx.workspaceId,
      taskId: task.id,
      actorUserId: ctx.appUser.id,
      entries: diffTaskChanges(previous, task),
    });
    return { ok: true, task };
  }

  const insert = augmentWriteWithFase7(base, {
    createdByUserId: ctx.appUser.id,
    visibility: "team",
  });
  let res = await ctx.supabase.from("daily_tasks").insert(insert).select("*").single();
  if (res.error && isUndefinedColumnError(res.error)) {
    res = await ctx.supabase.from("daily_tasks").insert(stripFase7Columns(insert)).select("*").single();
  }
  if (res.error || !res.data) {
    return { ok: false, status: 500, error: "No se pudo crear la tarea desde la recomendación." };
  }
  const task = hydrateTaskRow(res.data as Record<string, unknown>);
  await recordTaskHistory(ctx.supabase, {
    workspaceId: ctx.workspaceId,
    taskId: task.id,
    actorUserId: ctx.appUser.id,
    entries: [createdEntry(), ...diffTaskChanges({}, task)],
  });
  return { ok: true, task: action === "dismiss" ? null : task };
}

export async function applyRecommendationAction(
  ctx: UnifiedTaskFeedContext,
  input: { stableKey: string; action: RecommendationAction }
): Promise<RecommendationActionResult> {
  const viewer = await buildTaskViewer(ctx.supabase, ctx.appUser);
  const todayYmd = todayYmdMontevideo();
  const rec = await findRecommendationForAction(ctx, viewer, input.stableKey, todayYmd);
  if (!rec) return { ok: false, status: 404, error: "No encontramos esa recomendación activa." };
  return upsertRecommendationTask(ctx, viewer, rec, input.action, todayYmd);
}
